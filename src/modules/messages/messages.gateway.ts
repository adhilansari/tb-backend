import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * WebSocket Gateway for Real-time Messaging
 * Handles WebSocket connections, message delivery, typing indicators, and presence
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  },
  namespace: '/messages',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagesGateway.name);
  private userSockets = new Map<string, string>(); // userId -> socketId
  private socketUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      const userId = payload.sub;

      // Store user-socket mapping
      this.userSockets.set(userId, client.id);
      this.socketUsers.set(client.id, userId);

      // Join user-specific room
      client.join(`user:${userId}`);

      this.logger.log(`User ${userId} connected with socket ${client.id}`);

      // Emit connection success
      client.emit('connected', { userId, socketId: client.id });

      // Notify user is online (optional - for presence feature)
      this.server.emit('user-online', { userId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Authentication failed for socket ${client.id}:`, errorMessage);
      client.disconnect();
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnect(client: Socket) {
    const userId = this.socketUsers.get(client.id);

    if (userId) {
      this.userSockets.delete(userId);
      this.socketUsers.delete(client.id);

      this.logger.log(`User ${userId} disconnected (socket ${client.id})`);

      // Notify user is offline (optional - for presence feature)
      this.server.emit('user-offline', { userId });
    }
  }

  /**
   * Emit new message to specific user
   */
  emitNewMessage(receiverId: string, message: any) {
    this.server.to(`user:${receiverId}`).emit('new-message', message);
    this.logger.debug(`Emitted new message to user ${receiverId}`);
  }

  /**
   * Emit message read notification
   */
  emitMessageRead(senderId: string, data: { conversationId: string; messageIds?: string[] }) {
    this.server.to(`user:${senderId}`).emit('message-read', data);
    this.logger.debug(`Emitted read receipt to user ${senderId}`);
  }

  /**
   * Emit typing indicator
   */
  emitTyping(receiverId: string, data: { conversationId: string; userId: string; isTyping: boolean }) {
    this.server.to(`user:${receiverId}`).emit('user-typing', data);
  }

  /**
   * Handle typing indicator from client
   */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; receiverId: string; isTyping: boolean },
  ) {
    const userId = this.socketUsers.get(client.id);

    if (!userId) {
      return;
    }

    // Emit typing status to receiver
    this.emitTyping(data.receiverId, {
      conversationId: data.conversationId,
      userId,
      isTyping: data.isTyping,
    });
  }

  /**
   * Handle user joining a conversation room
   * Useful for presence and real-time updates within a conversation
   */
  @SubscribeMessage('join-conversation')
  handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketUsers.get(client.id);

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    client.join(`conversation:${data.conversationId}`);
    this.logger.debug(`User ${userId} joined conversation ${data.conversationId}`);

    return { success: true, conversationId: data.conversationId };
  }

  /**
   * Handle user leaving a conversation room
   */
  @SubscribeMessage('leave-conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = this.socketUsers.get(client.id);

    if (!userId) {
      return { error: 'Unauthorized' };
    }

    client.leave(`conversation:${data.conversationId}`);
    this.logger.debug(`User ${userId} left conversation ${data.conversationId}`);

    return { success: true, conversationId: data.conversationId };
  }

  /**
   * Get online status of a user
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Get all connected users (for admin/debugging)
   */
  getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.userSockets.size;
  }
}
