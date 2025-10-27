// File: src/modules/comments/comments.service.ts
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async create(userId: string, assetId: string, text: string, parentId?: string) {
    const comment = await this.prisma.comment.create({
      data: { userId, assetId, text, parentId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Transform avatar URL to presigned URL
    return this.transformCommentAvatarUrl(comment);
  }

  async findByAsset(assetId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { assetId, deletedAt: null, parentId: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          replies: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.comment.count({ where: { assetId, deletedAt: null, parentId: null } }),
    ]);

    // Transform avatar URLs to presigned URLs for comments and replies
    const commentsWithPresignedUrls = await Promise.all(
      comments.map(async (comment) => {
        const transformedComment = await this.transformCommentAvatarUrl(comment);

        // Transform replies too
        if (transformedComment.replies) {
          transformedComment.replies = await Promise.all(
            transformedComment.replies.map(async (reply: any) =>
              this.transformCommentAvatarUrl(reply)
            )
          );
        }

        return transformedComment;
      })
    );

    return {
      data: commentsWithPresignedUrls,
      meta: { page, limit, total },
    };
  }

  async delete(id: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.userId !== userId) {
      throw new ForbiddenException('Not authorized');
    }
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Comment deleted' };
  }

  /**
   * Transform comment to frontend format with presigned avatar URL
   * Flattens user data to match frontend IComment interface
   */
  private async transformCommentAvatarUrl(comment: any): Promise<any> {
    let avatarUrl = null;

    if (comment.user?.avatarUrl) {
      try {
        avatarUrl = await this.storage.getPresignedUrl(comment.user.avatarUrl, 3600);
      } catch (error) {
        console.error('Failed to transform avatar URL:', error);
      }
    }

    // Flatten user data to match frontend IComment interface
    return {
      id: comment.id,
      userId: comment.userId,
      username: comment.user?.username || 'Unknown',
      userAvatar: avatarUrl,
      text: comment.text,
      timestamp: comment.createdAt,
      likes: comment.likes || 0,
      replies: comment.replies || [],
    };
  }
}
