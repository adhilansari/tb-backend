import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { NotificationsService, NotificationType } from '../notifications/notifications.service';

@Injectable()
export class LikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Toggle like on an asset (like if not liked, unlike if already liked)
   */
  async toggleLike(userId: string, assetId: string) {
    // Check if asset exists
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Check if already liked
    const existingLike = await this.prisma.like.findUnique({
      where: {
        userId_assetId: { userId, assetId },
      },
    });

    if (existingLike) {
      // Unlike: Delete the like and decrement count
      await this.prisma.$transaction([
        this.prisma.like.delete({
          where: { id: existingLike.id },
        }),
        this.prisma.asset.update({
          where: { id: assetId },
          data: { likes: { decrement: 1 } },
        }),
      ]);

      return {
        liked: false,
        message: 'Asset unliked successfully',
      };
    } else {
      // Like: Create the like and increment count
      await this.prisma.$transaction([
        this.prisma.like.create({
          data: { userId, assetId },
        }),
        this.prisma.asset.update({
          where: { id: assetId },
          data: { likes: { increment: 1 } },
        }),
      ]);

      // Send notification to asset creator (only if not liking own asset)
      if (asset.creatorId !== userId) {
        // Get user who liked
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        });

        if (user) {
          // Create notification for asset creator
          await this.notificationsService.create({
            userId: asset.creatorId,
            type: NotificationType.ASSET_LIKED,
            title: 'New Like',
            message: `${user.displayName} liked your "${asset.title}"`,
            actionUrl: `/asset/${assetId}`,
            metadata: {
              assetId,
              likerId: userId,
              likerName: user.displayName,
              likerAvatar: user.avatarUrl,
            },
          });
        }
      }

      return {
        liked: true,
        message: 'Asset liked successfully',
      };
    }
  }

  /**
   * Check if user has liked an asset
   */
  async checkLikeStatus(userId: string, assetId: string) {
    const like = await this.prisma.like.findUnique({
      where: {
        userId_assetId: { userId, assetId },
      },
    });

    return { liked: !!like };
  }

  /**
   * Get user's liked assets with pagination
   */
  async getUserLikes(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [likes, total] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: {
            include: {
              creator: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  verified: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.like.count({ where: { userId } }),
    ]);

    return {
      data: likes.map((like) => like.asset),
      meta: { page, limit, total },
    };
  }
}
