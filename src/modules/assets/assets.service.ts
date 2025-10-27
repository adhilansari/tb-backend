// ============================================
// FILE: src/modules/assets/assets.service.ts
// ============================================
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
  ) {}

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
      fileKey = fileUpload.key;
    }

    console.log('📥 Creating asset - Incoming DTO values:', {
      isFree: createAssetDto.isFree,
      price: createAssetDto.price,
      currency: createAssetDto.currency,
      discount: createAssetDto.discount,
      type: typeof createAssetDto.isFree,
    });

    const { isFree, price, discount, ...restDto } = createAssetDto;

    const assetData = {
      ...restDto,
      isFree,
      price: isFree ? 0 : price,
      discount: isFree ? undefined : discount,
      creatorId: userId,
      thumbnailUrl: thumbnailUpload.key,
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

    return this.transformAssetUrls(asset);
  }

  async findAll(filters: AssetFiltersDto, userId?: string) {
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

    // Get liked asset IDs for the current user if authenticated
    let likedAssetIds: Set<string> = new Set();
    if (userId) {
      const likes = await this.prisma.like.findMany({
        where: {
          userId,
          assetId: { in: assets.map(a => a.id) },
        },
        select: { assetId: true },
      });
      likedAssetIds = new Set(likes.map(l => l.assetId));
    }

    const assetsWithPresignedUrls = await Promise.all(
      assets.map(async (asset) => {
        const transformed = await this.transformAssetUrls(asset);
        return {
          ...transformed,
          isLiked: likedAssetIds.has(asset.id),
        };
      })
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

  async findFeatured(limit = 10, userId?: string) {
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

    // Get liked asset IDs for the current user if authenticated
    let likedAssetIds: Set<string> = new Set();
    if (userId) {
      const likes = await this.prisma.like.findMany({
        where: {
          userId,
          assetId: { in: assets.map(a => a.id) },
        },
        select: { assetId: true },
      });
      likedAssetIds = new Set(likes.map(l => l.assetId));
    }

    return Promise.all(
      assets.map(async (asset) => {
        const transformed = await this.transformAssetUrls(asset);
        return {
          ...transformed,
          isLiked: likedAssetIds.has(asset.id),
        };
      })
    );
  }

  async findTrending(limit = 10, userId?: string) {
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

    // Get liked asset IDs for the current user if authenticated
    let likedAssetIds: Set<string> = new Set();
    if (userId) {
      const likes = await this.prisma.like.findMany({
        where: {
          userId,
          assetId: { in: assets.map(a => a.id) },
        },
        select: { assetId: true },
      });
      likedAssetIds = new Set(likes.map(l => l.assetId));
    }

    return Promise.all(
      assets.map(async (asset) => {
        const transformed = await this.transformAssetUrls(asset);
        return {
          ...transformed,
          isLiked: likedAssetIds.has(asset.id),
        };
      })
    );
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

  async update(
    id: string,
    userId: string,
    updateAssetDto: UpdateAssetDto,
    thumbnail?: Express.Multer.File,
    assetFile?: Express.Multer.File
  ) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.creatorId !== userId) {
      throw new ForbiddenException('You can only update your own assets');
    }

    console.log('📥 [SERVICE] Updating asset - Incoming DTO values:', {
      isFree: updateAssetDto.isFree,
      isFreeType: typeof updateAssetDto.isFree,
      price: updateAssetDto.price,
      priceType: typeof updateAssetDto.price,
      currency: updateAssetDto.currency,
      discount: updateAssetDto.discount,
    });

    // Handle file uploads if provided
    let thumbnailKey = asset.thumbnailUrl;
    let fileKey = asset.fileUrl;

    if (thumbnail) {
      const thumbnailUpload = await this.storage.uploadFile(thumbnail, 'thumbnails');
      thumbnailKey = thumbnailUpload.key;
    }

    if (assetFile) {
      const fileUpload = await this.storage.uploadFile(assetFile, 'assets');
      fileKey = fileUpload.key;
    }

    // Build update data
    const updateData: any = {
      thumbnailUrl: thumbnailKey,
      fileUrl: fileKey,
    };

    // Add basic fields if provided
    if (updateAssetDto.title !== undefined) {
      updateData.title = updateAssetDto.title;
    }
    if (updateAssetDto.description !== undefined) {
      updateData.description = updateAssetDto.description;
    }
    if (updateAssetDto.type !== undefined) {
      updateData.type = updateAssetDto.type;
    }
    if (updateAssetDto.category !== undefined) {
      updateData.category = updateAssetDto.category;
    }
    if (updateAssetDto.tags !== undefined) {
      updateData.tags = updateAssetDto.tags;
    }
    if (updateAssetDto.version !== undefined) {
      updateData.version = updateAssetDto.version;
    }
    if (updateAssetDto.currency !== undefined) {
      updateData.currency = updateAssetDto.currency;
    }

    // Handle isFree and pricing logic - SIMPLIFIED
    if (updateAssetDto.isFree !== undefined) {
      updateData.isFree = updateAssetDto.isFree;

      console.log('🔍 [SERVICE] isFree provided:', {
        value: updateAssetDto.isFree,
        type: typeof updateAssetDto.isFree,
      });

      if (updateAssetDto.isFree === true) {
        // Asset is free - force price to 0 and remove discount
        updateData.price = 0;
        updateData.discount = null;
        console.log('💰 [SERVICE] Asset set to FREE - price forced to 0');
      } else {
        // Asset is paid
        console.log('💰 [SERVICE] Asset set to PAID');
        if (updateAssetDto.price !== undefined) {
          updateData.price = updateAssetDto.price;
          console.log('💰 [SERVICE] Price set to:', updateAssetDto.price);
        }
        if (updateAssetDto.discount !== undefined) {
          updateData.discount = updateAssetDto.discount;
        }
      }
    } else if (updateAssetDto.price !== undefined) {
      // Only price was updated
      updateData.price = updateAssetDto.price;
      if (updateAssetDto.price > 0) {
        updateData.isFree = false;
        console.log('💰 [SERVICE] Price > 0, setting isFree to false');
      } else if (updateAssetDto.price === 0) {
        updateData.isFree = true;
        console.log('💰 [SERVICE] Price = 0, setting isFree to true');
      }
    }

    if (assetFile) {
      updateData.fileSize = `${(assetFile.size / 1024 / 1024).toFixed(2)} MB`;
    }

    console.log('💾 [SERVICE] FINAL - Updating database with:', {
      isFree: updateData.isFree,
      isFreeType: typeof updateData.isFree,
      price: updateData.price,
      priceType: typeof updateData.price,
      discount: updateData.discount,
    });

    const updatedAsset = await this.prisma.asset.update({
      where: { id },
      data: updateData,
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

    console.log('✅ [SERVICE] Asset updated in database:', {
      id: updatedAsset.id,
      isFree: updatedAsset.isFree,
      isFreeType: typeof updatedAsset.isFree,
      price: updatedAsset.price,
      priceType: typeof updatedAsset.price,
    });

    return this.transformAssetUrls(updatedAsset);
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

  private async transformAssetUrls(asset: any) {
    const thumbnailUrl = asset.thumbnailUrl
      ? await this.storage.getPresignedUrl(asset.thumbnailUrl, 3600)
      : null;

    const fileUrl = asset.fileUrl ? await this.storage.getPresignedUrl(asset.fileUrl, 3600) : null;

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
