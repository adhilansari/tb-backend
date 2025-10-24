// File: src/modules/reports/reports.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) { }

  async getOverview(userId: string) {
    const [totalRevenue, totalSales, totalAssets, totalViews, totalDownloads, averageRating] =
      await Promise.all([
        this.prisma.transaction.aggregate({
          where: { sellerId: userId, status: 'COMPLETED' },
          _sum: { amount: true },
        }),
        this.prisma.transaction.count({ where: { sellerId: userId, status: 'COMPLETED' } }),
        this.prisma.asset.count({ where: { creatorId: userId, deletedAt: null } }),
        this.prisma.asset.aggregate({ where: { creatorId: userId }, _sum: { views: true } }),
        this.prisma.asset.aggregate({ where: { creatorId: userId }, _sum: { downloads: true } }),
        this.prisma.asset.aggregate({ where: { creatorId: userId }, _avg: { rating: true } }),
      ]);

    const recentSales = await this.prisma.transaction.findMany({
      where: { sellerId: userId, status: 'COMPLETED' },
      take: 10,
      orderBy: { completedAt: 'desc' },
      include: { asset: { select: { id: true, title: true, thumbnailUrl: true } } },
    });

    // Transform thumbnail URLs to presigned URLs
    const recentSalesWithPresignedUrls = await Promise.all(
      recentSales.map(async (sale) => ({
        ...sale,
        asset: sale.asset
          ? {
            ...sale.asset,
            thumbnailUrl: await this.storage.getPresignedUrl(sale.asset.thumbnailUrl, 3600),
          }
          : null,
      }))
    );

    const topAsset = await this.prisma.asset.findFirst({
      where: { creatorId: userId },
      orderBy: { views: 'desc' },
      select: { id: true, title: true, views: true },
    });

    return {
      totalRevenue: totalRevenue._sum.amount || 0,
      totalSales,
      totalAssets,
      totalViews: totalViews._sum.views || 0,
      totalDownloads: totalDownloads._sum.downloads || 0,
      averageRating: averageRating._avg.rating || 0,
      recentSales: recentSalesWithPresignedUrls,
      topAsset,
    };
  }

  async getMonthlyRevenue(userId: string, months = 12) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        sellerId: userId,
        status: 'COMPLETED',
        completedAt: { gte: startDate },
      },
      select: { amount: true, completedAt: true },
    });

    const monthlyData = transactions.reduce((acc: any, t: any) => {
      const month = t.completedAt.toISOString().substring(0, 7);
      acc[month] = (acc[month] || 0) + t.amount;
      return acc;
    }, {});

    return Object.entries(monthlyData).map(([month, value]) => ({ month, value }));
  }
}
