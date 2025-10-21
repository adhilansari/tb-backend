import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchAssets(query: string, filters: any, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const where: any = {
      deletedAt: null,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { has: query } },
      ],
    };

    if (filters.type) where.type = filters.type;
    if (filters.category) where.category = filters.category;

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        include: { creator: { select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true } } },
      }),
      this.prisma.asset.count({ where }),
    ]);

    return { data: assets, meta: { page, limit, total } };
  }

  async searchCreators(query: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [creators, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          isCreator: true,
          deletedAt: null,
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
        },
        skip,
        take: limit,
        select: { id: true, username: true, displayName: true, avatarUrl: true, verified: true, bio: true },
      }),
      this.prisma.user.count({
        where: {
          isCreator: true,
          deletedAt: null,
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { displayName: { contains: query, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return { data: creators, meta: { page, limit, total } };
  }
}
