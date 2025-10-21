import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

/**
 * Cache Service - Redis-based caching
 * Provides get, set, delete, and clear operations
 */
@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private client: RedisClientType | null = null;
  private readonly defaultTTL: number;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.defaultTTL = this.configService.get('redis.ttl') || 3600;

    // Check if Redis is configured
    const redisHost = this.configService.get('redis.host');
    this.isEnabled = !!redisHost && redisHost !== 'localhost' || process.env.REDIS_ENABLED === 'true';
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.warn('⚠️  Redis cache is disabled (not configured)');
      return;
    }

    try {
      const redisConfig = {
        socket: {
          host: this.configService.get('redis.host'),
          port: this.configService.get('redis.port'),
        },
        password: this.configService.get('redis.password'),
      };

      this.client = createClient(redisConfig);

      this.client.on('error', (error) => {
        this.logger.error(`Redis client error: ${error}`);
      });

      this.client.on('connect', () => {
        this.logger.log('✅ Redis cache connected');
      });

      await this.client.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${error}`);
      this.client = null;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}: ${error}`);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;

      await this.client.setEx(key, expiry, serialized);
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}: ${error}`);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}: ${error}`);
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        this.logger.log(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger.error(`Cache deletePattern error for pattern ${pattern}: ${error}`);
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.flushAll();
      this.logger.log('Cache cleared');
    } catch (error) {
      this.logger.error(`Cache clear error: ${error}`);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Cache exists error for key ${key}: ${error}`);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.client) {
      return -1;
    }

    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(`Cache TTL error for key ${key}: ${error}`);
      return -1;
    }
  }
}
