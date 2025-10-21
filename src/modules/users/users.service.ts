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
    private readonly storage: StorageService,
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
        isCreator: true,
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
    const [assets, followers, following, totalSales, totalEarnings, totalLikes, totalViews] = await Promise.all([
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
      totalSales: totalSales,
      totalEarnings: totalEarnings._sum.amount || 0,
      totalFollowers: followers,
      totalFollowing: following,
      totalLikes: totalLikes,
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

  async getFollowers(userId: string, page: number = 1, limit: number = 20) {
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
              isCreator: true,
              verified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followingId: userId } }),
    ]);

    return {
      data: followers.map(f => f.follower),
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

  async getFollowing(userId: string, page: number = 1, limit: number = 20) {
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
              isCreator: true,
              verified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);

    return {
      data: following.map(f => f.following),
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
    // Validate that it's an image
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('File must be an image');
    }

    // Get current user to delete old avatar if exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    // Delete old avatar from storage if it exists
    if (user?.avatarUrl) {
      try {
        let key: string;

        if (user.avatarUrl.includes('/api/files/')) {
          const parts = user.avatarUrl.split('/api/files/');
          key = parts[1];
        } else if (user.avatarUrl.startsWith('http')) {
          const url = new URL(user.avatarUrl);
          key = url.pathname.replace(/^\//, '');
        } else {
          key = user.avatarUrl;
        }

        await this.storage.deleteFile(key);
      } catch (error) {
        console.error('Failed to delete old avatar from storage:', error);
        // Continue with upload even if deletion fails
      }
    }

    // Upload new avatar
    const upload = await this.storage.uploadFile(file, 'avatars');

    // Update user with new avatar URL
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: upload.url },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return {
      message: 'Avatar uploaded successfully',
      avatarUrl: updatedUser.avatarUrl,
      user: updatedUser,
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

    // Extract S3 key from stored URL
    try {
      let key: string;

      if (user.avatarUrl.includes('/api/files/')) {
        // Extract key from /api/files/ URL
        const parts = user.avatarUrl.split('/api/files/');
        key = parts[1]; // e.g., "avatars/filename.jpg"
      } else if (user.avatarUrl.startsWith('http')) {
        // If it's a full URL, try to extract the key from the path
        const url = new URL(user.avatarUrl);
        key = url.pathname.replace(/^\//, ''); // Remove leading slash
      } else {
        // Assume it's already a key
        key = user.avatarUrl;
      }

      // Delete the file from R2 storage
      await this.storage.deleteFile(key);
    } catch (error) {
      console.error('Failed to delete avatar from storage:', error);
      // Continue with database update even if storage deletion fails
    }

    // Update user to remove avatar
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
      // Extract S3 key from the stored URL
      // URL format: http://localhost:3000/api/files/avatars/filename.jpg
      // We need to extract: avatars/filename.jpg
      let key: string;

      if (user.avatarUrl.includes('/api/files/')) {
        // Extract key from /api/files/ URL
        const parts = user.avatarUrl.split('/api/files/');
        key = parts[1]; // e.g., "avatars/filename.jpg"
      } else if (user.avatarUrl.startsWith('http')) {
        // If it's a full URL, try to extract the key from the path
        const url = new URL(user.avatarUrl);
        key = url.pathname.replace(/^\//, ''); // Remove leading slash
      } else {
        // Assume it's already a key
        key = user.avatarUrl;
      }

      // Generate presigned URL (valid for 1 hour)
      const presignedUrl = await this.storage.getPresignedUrl(key, 3600);

      return {
        ...user,
        avatarUrl: presignedUrl,
      };
    } catch (error) {
      // If transformation fails, return user with original avatarUrl
      console.error('Failed to transform avatar URL:', error);
      return user;
    }
  }

  private async createNotification(userId: string, data: any) {
    await this.prisma.notification.create({
      data: { userId, ...data },
    });
  }

  async getLikedAssets(userId: string, page: number = 1, limit: number = 20) {
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

    return {
      data: likes.map(like => like.asset),
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
