// File: src/modules/search/search.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) { }

  async searchAssets(query: string, filters: any, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = {
      deletedAt: null,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { has: query } },
      ],
    };

    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.category) {
      where.category = filters.category;
    }

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
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
      }),
      this.prisma.asset.count({ where }),
    ]);

    // Transform thumbnail and avatar URLs to presigned URLs
    const assetsWithPresignedUrls = await Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        thumbnailUrl: asset.thumbnailUrl
          ? await this.storage.getPresignedUrl(asset.thumbnailUrl, 3600)
          : null,
        creator:
          asset.creator && asset.creator.avatarUrl
            ? {
              ...asset.creator,
              avatarUrl: await this.storage.getPresignedUrl(asset.creator.avatarUrl, 3600),
            }
            : asset.creator,
      }))
    );

    return {
      data: assetsWithPresignedUrls,
      meta: { page, limit, total },
    };
  }

  async searchCreators(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const where: any = {
      role: 'CREATOR',
      deletedAt: null,
    };

    if (query && query.trim()) {
      where.OR = [
        { username: { contains: query, mode: 'insensitive' } },
        { displayName: { contains: query, mode: 'insensitive' } },
      ];
    }

    const [creators, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          verified: true,
          bio: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Transform avatar URLs to presigned URLs
    const creatorsWithPresignedUrls = await Promise.all(
      creators.map(async (creator) => ({
        ...creator,
        avatarUrl: creator.avatarUrl
          ? await this.storage.getPresignedUrl(creator.avatarUrl, 3600)
          : null,
      }))
    );

    return {
      data: creatorsWithPresignedUrls,
      meta: { page, limit, total },
    };
  }
}
