import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Toggle follow on a user (follow if not following, unfollow if already following)
   */
  async toggleFollow(followerId: string, targetUserId: string) {
    // Can't follow yourself
    if (followerId === targetUserId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    // Check if target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Check if already following
    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUserId,
        },
      },
    });

    if (existingFollow) {
      // Unfollow: Delete the follow relationship
      await this.prisma.follow.delete({
        where: { id: existingFollow.id },
      });

      return {
        following: false,
        message: 'User unfollowed successfully',
      };
    } else {
      // Follow: Create the follow relationship
      await this.prisma.follow.create({
        data: {
          followerId,
          followingId: targetUserId,
        },
      });

      return {
        following: true,
        message: 'User followed successfully',
      };
    }
  }

  /**
   * Check if user is following another user
   */
  async checkFollowStatus(followerId: string, targetUserId: string) {
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUserId,
        },
      },
    });

    return { following: !!follow };
  }

  /**
   * Get user's followers with pagination
   */
  async getFollowers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [follows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              verified: true,
            },
          },
        },
      }),
      this.prisma.follow.count({ where: { followingId: userId } }),
    ]);

    // Transform avatar URLs
    const followersWithPresignedUrls = await Promise.all(
      follows.map(async (follow) => {
        const follower = follow.follower;
        if (follower.avatarUrl) {
          try {
            follower.avatarUrl = await this.storage.getPresignedUrl(
              follower.avatarUrl,
              3600,
            );
          } catch (error) {
            console.error('Failed to transform avatar URL:', error);
          }
        }
        return follower;
      }),
    );

    return {
      data: followersWithPresignedUrls,
      meta: { page, limit, total },
    };
  }

  /**
   * Get users that a user is following with pagination
   */
  async getFollowing(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [follows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
              verified: true,
            },
          },
        },
      }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);

    // Transform avatar URLs
    const followingWithPresignedUrls = await Promise.all(
      follows.map(async (follow) => {
        const following = follow.following;
        if (following.avatarUrl) {
          try {
            following.avatarUrl = await this.storage.getPresignedUrl(
              following.avatarUrl,
              3600,
            );
          } catch (error) {
            console.error('Failed to transform avatar URL:', error);
          }
        }
        return following;
      }),
    );

    return {
      data: followingWithPresignedUrls,
      meta: { page, limit, total },
    };
  }

  /**
   * Get follow stats for a user
   */
  async getFollowStats(userId: string) {
    const [followersCount, followingCount] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: userId } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);

    return {
      followers: followersCount,
      following: followingCount,
    };
  }
}
