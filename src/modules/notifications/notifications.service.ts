import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { NotificationType } from '@prisma/client';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl: string;
  fromUserId?: string;
  assetId?: string;
}

// Export Prisma's NotificationType for convenience
export { NotificationType };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { data: notifications, meta: { page, limit, total, unreadCount } };
  }

  async markAsRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return { message: 'Marked as read' };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { message: 'All notifications marked as read' };
  }

  async delete(id: string, userId: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { message: 'Notification deleted' };
  }

  /**
   * Create a new notification and send push notification
   */
  async create(data: CreateNotificationDto) {
    try {
      // Create in-app notification
      const notification = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          actionUrl: data.actionUrl,
          fromUserId: data.fromUserId,
          assetId: data.assetId,
          read: false,
        },
      });

      // Send push notification (if user has FCM tokens)
      await this.sendPushNotification(data);

      this.logger.log(`Notification created for user ${data.userId}: ${data.type}`);

      return notification;
    } catch (error: any) {
      this.logger.error(`Failed to create notification: ${error?.message || 'Unknown error'}`, error?.stack);
      throw error;
    }
  }

  /**
   * Send push notification via Firebase Cloud Messaging
   * TODO: Implement FCM integration
   */
  private async sendPushNotification(data: CreateNotificationDto) {
    try {
      // Get user's FCM tokens
      // const tokens = await this.getUserFcmTokens(data.userId);

      // if (tokens.length === 0) {
      //   this.logger.debug(`No FCM tokens found for user ${data.userId}`);
      //   return;
      // }

      // For now, just log that we would send a push notification
      this.logger.debug(
        `[PUSH NOTIFICATION] Would send to user ${data.userId}: ${data.title} - ${data.message}`,
      );

      // TODO: Implement actual FCM sending
      // const message = {
      //   notification: {
      //     title: data.title,
      //     body: data.message,
      //   },
      //   data: {
      //     type: data.type,
      //     actionUrl: data.actionUrl,
      //     ...data.metadata,
      //   },
      //   tokens: tokens,
      // };
      // await admin.messaging().sendMulticast(message);
    } catch (error: any) {
      this.logger.error(`Failed to send push notification: ${error?.message || 'Unknown error'}`);
      // Don't throw - notification creation should succeed even if push fails
    }
  }
}
