import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) { }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username, deletedAt: null },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        bio: true,
        role: true,
        verified: true,
        createdAt: true,
        socialTwitter: true,
        socialInstagram: true,
        socialYoutube: true,
        socialLinkedin: true,
        socialGithub: true,
        socialWebsite: true,
        twitterFollowers: true,
        instagramFollowers: true,
        youtubeSubscribers: true,
        linkedinConnections: true,
        githubFollowers: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const stats = await this.getUserStats(user.id);

    // Transform avatar URL to presigned URL if it exists
    const transformedUser = await this.transformUserAvatarUrl(user);

    return { ...transformedUser, stats };
  }

  async getUserStats(userId: string) {
    const [assets, followers, following, totalSales, totalEarnings, totalLikes, totalViews] =
      await Promise.all([
        this.prisma.asset.count({ where: { creatorId: userId, deletedAt: null } }),
        this.prisma.follow.count({ where: { followingId: userId } }),
        this.prisma.follow.count({ where: { followerId: userId } }),
        this.prisma.transaction.count({ where: { sellerId: userId, status: 'COMPLETED' } }),
        this.prisma.transaction.aggregate({
          where: { sellerId: userId, status: 'COMPLETED' },
          _sum: { amount: true },
        }),
        this.prisma.like.count({
          where: { asset: { creatorId: userId } },
        }),
        this.prisma.asset.aggregate({
          where: { creatorId: userId, deletedAt: null },
          _sum: { views: true },
        }),
      ]);

    return {
      totalUploads: assets,
      totalSales,
      totalEarnings: totalEarnings._sum.amount || 0,
      totalFollowers: followers,
      totalFollowing: following,
      totalLikes,
      totalViews: totalViews._sum.views || 0,
    };
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: updateUserDto,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        bio: true,
        socialTwitter: true,
        socialInstagram: true,
        socialYoutube: true,
        socialLinkedin: true,
        socialGithub: true,
        socialWebsite: true,
      },
    });
  }

  async updateSettings(userId: string, updateSettingsDto: UpdateSettingsDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: updateSettingsDto,
    });
  }

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    const targetUser = await this.prisma.user.findUnique({ where: { id: followingId } });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (existing) {
      throw new BadRequestException('Already following this user');
    }

    await this.prisma.follow.create({
      data: { followerId, followingId },
    });

    await this.createNotification(followingId, {
      type: 'FOLLOW',
      title: 'New Follower',
      message: `${targetUser.displayName} started following you`,
      fromUserId: followerId,
    });

    return { message: 'Successfully followed user' };
  }

  async unfollowUser(followerId: string, followingId: string) {
    const follow = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (!follow) {
      throw new BadRequestException('Not following this user');
    }

    await this.prisma.follow.delete({ where: { id: follow.id } });
    return { message: 'Successfully unfollowed user' };
  }

  async getFollowers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [followers, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: userId },
        skip,
        take: limit,
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              role: true,
              verified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followingId: userId } }),
    ]);

    // Transform avatar URLs
    const followersWithPresignedUrls = await Promise.all(
      followers.map(async (f) => ({
        ...f.follower,
        avatarUrl: f.follower.avatarUrl
          ? await this.storage.getPresignedUrl(f.follower.avatarUrl, 3600)
          : null,
      }))
    );

    return {
      data: followersWithPresignedUrls,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrevious: page > 1,
      },
    };
  }

  async getFollowing(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [following, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        skip,
        take: limit,
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              role: true,
              verified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);

    // Transform avatar URLs
    const followingWithPresignedUrls = await Promise.all(
      following.map(async (f) => ({
        ...f.following,
        avatarUrl: f.following.avatarUrl
          ? await this.storage.getPresignedUrl(f.following.avatarUrl, 3600)
          : null,
      }))
    );

    return {
      data: followingWithPresignedUrls,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrevious: page > 1,
      },
    };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    // Delete old avatar from storage if it exists
    if (user?.avatarUrl) {
      try {
        await this.storage.deleteFile(user.avatarUrl); // Already a key
      } catch (error) {
        console.error('Failed to delete old avatar:', error);
      }
    }

    const upload = await this.storage.uploadFile(file, 'avatars');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: upload.key }, // Store KEY
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    const avatarPresignedUrl = await this.storage.getPresignedUrl(updatedUser.avatarUrl!, 3600);

    return {
      message: 'Avatar uploaded successfully',
      avatarUrl: avatarPresignedUrl,
      user: {
        ...updatedUser,
        avatarUrl: avatarPresignedUrl,
      },
    };
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (!user?.avatarUrl) {
      throw new BadRequestException('No avatar to remove');
    }

    try {
      await this.storage.deleteFile(user.avatarUrl); // Already a key
    } catch (error) {
      console.error('Failed to delete avatar from storage:', error);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });

    return { message: 'Avatar removed successfully' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    // Get user with password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  /**
   * Transform user avatar URL to presigned URL
   * Extracts S3 key from stored URL and generates fresh presigned URL
   */
  private async transformUserAvatarUrl(user: any): Promise<any> {
    if (!user.avatarUrl) {
      return user;
    }

    try {
      // The avatarUrl is already a key stored in database
      const presignedUrl = await this.storage.getPresignedUrl(user.avatarUrl, 3600);
      return {
        ...user,
        avatarUrl: presignedUrl,
      };
    } catch (error) {
      console.error('Failed to transform avatar URL:', error);
      return user;
    }
  }

  private async createNotification(userId: string, data: any) {
    await this.prisma.notification.create({
      data: { userId, ...data },
    });
  }

  async getLikedAssets(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [likes, total] = await Promise.all([
      this.prisma.like.findMany({
        where: { userId },
        skip,
        take: limit,
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
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.like.count({ where: { userId } }),
    ]);

    // Transform thumbnail and avatar URLs
    const likesWithPresignedUrls = await Promise.all(
      likes.map(async (like) => ({
        ...like.asset,
        thumbnailUrl: like.asset.thumbnailUrl
          ? await this.storage.getPresignedUrl(like.asset.thumbnailUrl, 3600)
          : null,
        creator:
          like.asset.creator && like.asset.creator.avatarUrl
            ? {
              ...like.asset.creator,
              avatarUrl: await this.storage.getPresignedUrl(like.asset.creator.avatarUrl, 3600),
            }
            : like.asset.creator,
      }))
    );

    return {
      data: likesWithPresignedUrls,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrevious: page > 1,
      },
    };
  }
}
