import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma Service - Global database service
 * Handles database connection lifecycle and provides Prisma Client instance
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
      errorFormat: 'pretty',
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');

      // Log queries in development
      if (process.env.NODE_ENV === 'development') {
        this.$on('query' as never, (event: any) => {
          this.logger.debug(`Query: ${event.query}`);
          this.logger.debug(`Duration: ${event.duration}ms`);
        });
      }

      // Log errors
      this.$on('error' as never, (event: any) => {
        this.logger.error(`Prisma error: ${event.message}`);
      });
    } catch (error) {
      this.logger.error('❌ Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * Helper method to handle soft deletes
   */
  async softDelete(model: string, id: string): Promise<any> {
    return (this as any)[model].update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Helper method to restore soft deleted records
   */
  async restore(model: string, id: string): Promise<any> {
    return (this as any)[model].update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  /**
   * Clean up test database (for testing only)
   */
  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase can only be called in test environment');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && key[0] !== '_' && key !== 'constructor',
    );

    await Promise.all(
      models.map((modelKey) => {
        const model = (this as any)[modelKey];
        if (model?.deleteMany) {
          return model.deleteMany();
        }
        return Promise.resolve();
      }),
    );
  }
}
