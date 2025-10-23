import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) { }

  async getAllUsers(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          role: true,
          verified: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return { data: users, meta: { page, limit, total } };
  }

  async verifyUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { verified: true },
    });
    return { message: 'User verified' };
  }

  async deleteUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    return { message: 'User deleted' };
  }

  async getAllAssets(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        include: { creator: { select: { username: true, displayName: true } } },
      }),
      this.prisma.asset.count({ where: { deletedAt: null } }),
    ]);
    return { data: assets, meta: { page, limit, total } };
  }

  async featureAsset(assetId: string) {
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { featured: true },
    });
    return { message: 'Asset featured' };
  }

  async deleteAsset(assetId: string) {
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });
    return { message: 'Asset deleted' };
  }

  async getStats() {
    const [
      totalUsers,
      totalCreators,
      totalAssets,
      totalTransactions,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { role: 'CREATOR', deletedAt: null } }),
      this.prisma.asset.count({ where: { deletedAt: null } }),
      this.prisma.transaction.count({ where: { status: 'COMPLETED' } }),
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalUsers,
      totalCreators,
      totalAssets,
      totalTransactions,
      totalRevenue: totalRevenue._sum.amount || 0,
    };
  }
}
