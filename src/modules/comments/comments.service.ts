import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, assetId: string, text: string, parentId?: string) {
    return this.prisma.comment.create({
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
  }

  async findByAsset(assetId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { assetId, deletedAt: null, parentId: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          replies: { include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } } },
        },
      }),
      this.prisma.comment.count({ where: { assetId, deletedAt: null, parentId: null } }),
    ]);
    return { data: comments, meta: { page, limit, total } };
  }

  async delete(id: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException('Not authorized');
    await this.prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Comment deleted' };
  }
}
