// File: src/modules/assets/assets.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetFiltersDto } from './dto/asset-filters.dto';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) { }

  async create(
    userId: string,
    createAssetDto: CreateAssetDto,
    thumbnail: Express.Multer.File,
    assetFile?: Express.Multer.File
  ) {
    const thumbnailUpload = await this.storage.uploadFile(thumbnail, 'thumbnails');
    let fileKey: string | undefined;

    if (assetFile) {
      const fileUpload = await this.storage.uploadFile(assetFile, 'assets');
      fileKey = fileUpload.key; // Store the key, not the URL
    }

    // Debug: Log incoming DTO values
    console.log('📥 Creating asset - Incoming DTO values:', {
      isFree: createAssetDto.isFree,
      price: createAssetDto.price,
      currency: createAssetDto.currency,
      discount: createAssetDto.discount,
      type: typeof createAssetDto.isFree,
    });

    // Explicitly extract and set price/isFree to avoid defaults
    const { isFree, price, discount, ...restDto } = createAssetDto;

    const assetData = {
      ...restDto,
      isFree, // Explicit assignment
      price: isFree ? 0 : price, // If free, set price to 0
      discount: isFree ? undefined : discount, // If free, remove discount
      creatorId: userId,
      thumbnailUrl: thumbnailUpload.key, // Store key instead of URL
      fileUrl: fileKey,
      fileSize: assetFile ? `${(assetFile.size / 1024 / 1024).toFixed(2)} MB` : undefined,
    };

    console.log('💾 Creating asset with data:', {
      isFree: assetData.isFree,
      price: assetData.price,
      discount: assetData.discount,
    });

    const asset = await this.prisma.asset.create({
      data: assetData,
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
    });

    // Generate presigned URLs for the response
    return this.transformAssetUrls(asset);
  }

  async findAll(filters: AssetFiltersDto) {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      category,
      isFree,
      minPrice,
      maxPrice,
      sortBy = 'recent',
      creatorId,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    if (type) {
      where.type = type;
    }
    if (category) {
      where.category = category;
    }
    if (typeof isFree === 'boolean') {
      where.isFree = isFree;
    }
    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }

    let orderBy: any = { createdAt: 'desc' };
    if (sortBy === 'popular') {
      orderBy = { views: 'desc' };
    } else if (sortBy === 'price-low') {
      orderBy = { price: 'asc' };
    } else if (sortBy === 'price-high') {
      orderBy = { price: 'desc' };
    } else if (sortBy === 'rating') {
      orderBy = { rating: 'desc' };
    }

    const [assets, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy,
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

    // Generate presigned URLs for all assets
    const assetsWithPresignedUrls = await Promise.all(
      assets.map(async (asset) => this.transformAssetUrls(asset))
    );

    return {
      data: assetsWithPresignedUrls,
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

  async findFeatured(limit = 10) {
    const assets = await this.prisma.asset.findMany({
      where: { featured: true, deletedAt: null },
      take: limit,
      orderBy: { createdAt: 'desc' },
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
    });

    return Promise.all(assets.map(async (asset) => this.transformAssetUrls(asset)));
  }

  async findTrending(limit = 10) {
    const assets = await this.prisma.asset.findMany({
      where: { trending: true, deletedAt: null },
      take: limit,
      orderBy: { views: 'desc' },
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
    });

    return Promise.all(assets.map(async (asset) => this.transformAssetUrls(asset)));
  }

  async findOne(id: string, userId?: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id, deletedAt: null },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            verified: true,
            bio: true,
          },
        },
        comments: {
          where: { deletedAt: null, parentId: null },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const isLiked = userId
      ? !!(await this.prisma.like.findUnique({
        where: { userId_assetId: { userId, assetId: id } },
      }))
      : false;

    const transformedAsset = await this.transformAssetUrls(asset);
    return { ...transformedAsset, isLiked };
  }

  async update(id: string, userId: string, updateAssetDto: UpdateAssetDto) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.creatorId !== userId) {
      throw new ForbiddenException('You can only update your own assets');
    }

    return this.prisma.asset.update({
      where: { id },
      data: updateAssetDto,
    });
  }

  async remove(id: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.creatorId !== userId) {
      throw new ForbiddenException('You can only delete your own assets');
    }

    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Asset deleted successfully' };
  }

  async likeAsset(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const existing = await this.prisma.like.findUnique({
      where: { userId_assetId: { userId, assetId } },
    });

    if (existing) {
      throw new BadRequestException('Already liked this asset');
    }

    await this.prisma.$transaction([
      this.prisma.like.create({ data: { userId, assetId } }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { likes: { increment: 1 } },
      }),
    ]);

    if (asset.creatorId !== userId) {
      await this.createNotification(asset.creatorId, {
        type: 'LIKE',
        title: 'New Like',
        message: 'Someone liked your asset',
        fromUserId: userId,
        actionUrl: `/asset/${assetId}`,
      });
    }

    return { message: 'Asset liked successfully', likes: asset.likes + 1 };
  }

  async unlikeAsset(userId: string, assetId: string) {
    const like = await this.prisma.like.findUnique({
      where: { userId_assetId: { userId, assetId } },
    });

    if (!like) {
      throw new BadRequestException('Asset not liked');
    }

    await this.prisma.$transaction([
      this.prisma.like.delete({ where: { id: like.id } }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { likes: { decrement: 1 } },
      }),
    ]);

    return { message: 'Asset unliked successfully' };
  }

  async incrementView(assetId: string) {
    await this.prisma.asset.update({
      where: { id: assetId },
      data: { views: { increment: 1 } },
    });
    return { message: 'View counted' };
  }

  async getDownloadUrl(assetId: string, userId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const hasPurchased = await this.prisma.transaction.findFirst({
      where: {
        assetId,
        buyerId: userId,
        status: 'COMPLETED',
      },
    });

    if (!asset.isFree && !hasPurchased && asset.creatorId !== userId) {
      throw new ForbiddenException('You must purchase this asset to download');
    }

    if (!asset.fileUrl) {
      throw new BadRequestException('No file available for download');
    }

    await this.prisma.asset.update({
      where: { id: assetId },
      data: { downloads: { increment: 1 } },
    });

    const downloadUrl = await this.storage.getPresignedUrl(asset.fileUrl, 3600);
    return { downloadUrl };
  }

  async getMyTopAssets(userId: string, limit = 5) {
    const assets = await this.prisma.asset.findMany({
      where: {
        creatorId: userId,
        deletedAt: null,
      },
      take: limit,
      orderBy: [{ views: 'desc' }, { downloads: 'desc' }],
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        views: true,
        likes: true,
        downloads: true,
        price: true,
        currency: true,
        _count: {
          select: {
            transactions: {
              where: {
                status: 'COMPLETED',
              },
            },
          },
        },
        transactions: {
          where: {
            status: 'COMPLETED',
          },
          select: {
            amount: true,
          },
        },
      },
    });

    const assetsWithStats = await Promise.all(
      assets.map(async (asset) => {
        const sales = asset._count.transactions;
        const revenue = asset.transactions.reduce((sum, t) => sum + t.amount, 0);
        const thumbnailUrl = await this.storage.getPresignedUrl(asset.thumbnailUrl, 3600);

        return {
          id: asset.id,
          title: asset.title,
          thumbnailUrl,
          sales,
          revenue,
          views: asset.views,
          likes: asset.likes,
          price: asset.price,
          currency: asset.currency,
        };
      })
    );

    return { data: assetsWithStats };
  }

  /**
   * Transform asset URLs from storage keys to presigned URLs
   */
  private async transformAssetUrls(asset: any) {
    const thumbnailUrl = asset.thumbnailUrl
      ? await this.storage.getPresignedUrl(asset.thumbnailUrl, 3600)
      : null;

    // Transform fileUrl from storage key to presigned URL
    const fileUrl = asset.fileUrl ? await this.storage.getPresignedUrl(asset.fileUrl, 3600) : null;

    // Transform creator's avatar URL if it exists
    const creator = asset.creator
      ? {
        ...asset.creator,
        avatarUrl: asset.creator.avatarUrl
          ? await this.storage.getPresignedUrl(asset.creator.avatarUrl, 3600)
          : null,
      }
      : undefined;

    return {
      ...asset,
      thumbnailUrl,
      fileUrl,
      creator,
    };
  }

  private async createNotification(userId: string, data: any) {
    await this.prisma.notification.create({
      data: { userId, ...data },
    });
  }
}
