import { Injectable, NotFoundException, BadRequestException, ForbiddenException, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesGateway } from './messages.gateway';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MessagesGateway))
    private readonly messagesGateway: MessagesGateway,
  ) { }

  /**
   * Get or create conversation between two users
   * Ensures conversations are unique and bidirectional
   */
  async getOrCreateConversation(user1Id: string, user2Id: string) {
    if (user1Id === user2Id) {
      throw new BadRequestException('Cannot start conversation with yourself');
    }

    // Check if target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: user2Id },
      select: { id: true, allowMessages: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (!targetUser.allowMessages) {
      throw new ForbiddenException('This user has disabled messages');
    }

    // Always ensure participant1Id < participant2Id for uniqueness
    const [participant1Id, participant2Id] = [user1Id, user2Id].sort();

    // Try to find existing conversation
    let conversation = await this.prisma.conversation.findUnique({
      where: {
        participant1Id_participant2Id: {
          participant1Id,
          participant2Id,
        },
      },
      include: {
        participant1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
            verified: true,
          },
        },
        participant2: {
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
    });

    // Create if doesn't exist
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          participant1Id,
          participant2Id,
        },
        include: {
          participant1: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              role: true,
              verified: true,
            },
          },
          participant2: {
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
      });
    }

    return conversation;
  }

  /**
   * Get all conversations for a user
   */
  async getUserConversations(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          OR: [
            { participant1Id: userId },
            { participant2Id: userId },
          ],
        },
        include: {
          participant1: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              role: true,
              verified: true,
            },
          },
          participant2: {
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
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({
        where: {
          OR: [
            { participant1Id: userId },
            { participant2Id: userId },
          ],
        },
      }),
    ]);

    // Transform conversations to include the "other" user and unread count
    const transformedConversations = conversations.map((conv) => {
      const isParticipant1 = conv.participant1Id === userId;
      const otherUser = isParticipant1 ? conv.participant2 : conv.participant1;
      const unreadCount = isParticipant1 ? conv.unreadCount1 : conv.unreadCount2;

      return {
        id: conv.id,
        otherUser,
        lastMessageAt: conv.lastMessageAt,
        lastMessageText: conv.lastMessageText,
        unreadCount,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    });

    return {
      data: transformedConversations,
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

  /**
   * Get a specific conversation
   */
  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participant1: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
            verified: true,
          },
        },
        participant2: {
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
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Check if user is participant
    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    return conversation;
  }

  /**
   * Send a message
   */
  async sendMessage(conversationId: string, senderId: string, createMessageDto: CreateMessageDto) {
    // Verify conversation and sender is participant
    const conversation = await this.getConversation(conversationId, senderId);

    // Determine receiver
    const receiverId = conversation.participant1Id === senderId
      ? conversation.participant2Id
      : conversation.participant1Id;

    // Create message
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: createMessageDto.content,
        attachmentUrl: createMessageDto.attachmentUrl,
        attachmentType: createMessageDto.attachmentType,
      },
      include: {
        sender: {
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
    });

    // Update conversation last message and increment unread count
    const isParticipant1 = senderId === conversation.participant1Id;
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessageText: createMessageDto.content.substring(0, 100),
        // Increment unread count for receiver
        ...(isParticipant1
          ? { unreadCount2: { increment: 1 } }
          : { unreadCount1: { increment: 1 } }),
      },
    });

    // Create notification for receiver
    await this.createMessageNotification(receiverId, senderId, conversationId);

    // Emit real-time message to receiver via WebSocket
    this.messagesGateway.emitNewMessage(receiverId, message);

    return message;
  }

  /**
   * Get messages in a conversation
   */
  async getMessages(conversationId: string, userId: string, page: number = 1, limit: number = 50) {
    // Verify user is participant
    await this.getConversation(conversationId, userId);

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          conversationId,
          deletedAt: null,
          // Filter out messages deleted by current user
          ...(userId && {
            OR: [
              { senderId: userId, deletedBySender: false },
              { senderId: { not: userId }, deletedByReceiver: false },
            ],
          }),
        },
        include: {
          sender: {
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
        skip,
        take: limit,
      }),
      this.prisma.message.count({
        where: {
          conversationId,
          deletedAt: null,
        },
      }),
    ]);

    return {
      data: messages.reverse(), // Reverse to show oldest first
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

  /**
   * Mark all messages in conversation as read
   */
  async markMessagesAsRead(conversationId: string, userId: string) {
    const conversation = await this.getConversation(conversationId, userId);

    // Determine which unread count to reset
    const isParticipant1 = userId === conversation.participant1Id;

    // Update conversation unread count
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: isParticipant1 ? { unreadCount1: 0 } : { unreadCount2: 0 },
    });

    // Mark all unread messages from the other user as read
    const otherUserId = isParticipant1 ? conversation.participant2Id : conversation.participant1Id;

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: otherUserId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    // Emit read receipt to other user via WebSocket
    this.messagesGateway.emitMessageRead(otherUserId, { conversationId });

    return { message: 'Messages marked as read' };
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string, userId: string, deleteFor: 'sender' | 'receiver' | 'both' = 'sender') {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user is participant
    const conversation = message.conversation;
    if (conversation.participant1Id !== userId && conversation.participant2Id !== userId) {
      throw new ForbiddenException('You cannot delete this message');
    }

    const isSender = message.senderId === userId;

    if (deleteFor === 'both') {
      // Hard delete (both sides)
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date(),
          deletedBySender: true,
          deletedByReceiver: true,
        },
      });
    } else if (deleteFor === 'sender' && isSender) {
      // Soft delete for sender
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deletedBySender: true },
      });
    } else if (deleteFor === 'receiver' && !isSender) {
      // Soft delete for receiver
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deletedByReceiver: true },
      });
    } else {
      throw new ForbiddenException('Invalid delete operation');
    }

    return { message: 'Message deleted successfully' };
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string, userId: string) {
    // Verify user is participant (throws if not)
    await this.getConversation(conversationId, userId);

    // Delete all messages in conversation
    await this.prisma.message.deleteMany({
      where: { conversationId },
    });

    // Delete conversation
    await this.prisma.conversation.delete({
      where: { id: conversationId },
    });

    return { message: 'Conversation deleted successfully' };
  }

  /**
   * Get total unread message count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { participant1Id: userId },
          { participant2Id: userId },
        ],
      },
      select: {
        participant1Id: true,
        unreadCount1: true,
        unreadCount2: true,
      },
    });

    const total = conversations.reduce((sum, conv) => {
      return sum + (conv.participant1Id === userId ? conv.unreadCount1 : conv.unreadCount2);
    }, 0);

    return total;
  }

  /**
   * Get unread count for specific conversation
   */
  async getConversationUnreadCount(conversationId: string, userId: string): Promise<number> {
    const conversation = await this.getConversation(conversationId, userId);
    const isParticipant1 = userId === conversation.participant1Id;
    return isParticipant1 ? conversation.unreadCount1 : conversation.unreadCount2;
  }

  /**
   * Create message notification
   */
  private async createMessageNotification(receiverId: string, senderId: string, conversationId: string) {
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true },
    });

    await this.prisma.notification.create({
      data: {
        userId: receiverId,
        type: 'MESSAGE',
        title: 'New Message',
        message: `${sender?.displayName || 'Someone'} sent you a message`,
        fromUserId: senderId,
        actionUrl: `/messages?conversation=${conversationId}`,
      },
    });
  }
}
