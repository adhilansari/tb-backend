import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * WebSocket Gateway for Real-time Notifications
 * Handles notification delivery in real-time
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:4200',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
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

      this.logger.log(`User ${userId} connected to notifications (socket ${client.id})`);

      // Emit connection success
      client.emit('connected', { userId, socketId: client.id });
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

      this.logger.log(`User ${userId} disconnected from notifications (socket ${client.id})`);
    }
  }

  /**
   * Emit notification to specific user
   */
  emitNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('new-notification', notification);
    this.logger.debug(`Emitted notification to user ${userId}`);
  }

  /**
   * Emit notification count update
   */
  emitNotificationCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('notification-count', { count });
    this.logger.debug(`Emitted notification count (${count}) to user ${userId}`);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.userSockets.size;
  }
}
