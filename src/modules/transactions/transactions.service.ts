import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
import { RazorpayService } from './razorpay.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
    private readonly storage: StorageService
  ) { }

  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    // Validate asset exists
    const asset = await this.prisma.asset.findUnique({
      where: { id: createOrderDto.assetId },
      include: { creator: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Check if asset is free
    if (asset.isFree) {
      throw new BadRequestException('This asset is free and cannot be purchased');
    }

    // Prevent self-purchase
    if (asset.creatorId === userId) {
      throw new BadRequestException('You cannot purchase your own asset');
    }

    // Check for existing purchase
    const existingPurchase = await this.prisma.transaction.findFirst({
      where: {
        buyerId: userId,
        assetId: asset.id,
        status: 'COMPLETED',
      },
    });

    if (existingPurchase) {
      throw new BadRequestException('You have already purchased this asset');
    }

    // Validate amount matches asset price
    if (createOrderDto.amount !== asset.price) {
      throw new BadRequestException(
        `Amount mismatch: expected ₹${asset.price}, received ₹${createOrderDto.amount}`
      );
    }

    // Generate unique receipt
    const receipt = `txn_${Date.now()}_${userId.substring(0, 8)}`;

    try {
      // Create Razorpay order (amount should be in rupees)
      const razorpayOrder = await this.razorpayService.createOrder(
        createOrderDto.amount, // Amount in rupees (e.g., 99.99)
        createOrderDto.currency,
        receipt
      );

      // Create transaction record
      const transaction = await this.prisma.transaction.create({
        data: {
          buyerId: userId,
          sellerId: asset.creatorId,
          assetId: asset.id,
          amount: createOrderDto.amount, // Store amount in rupees
          currency: createOrderDto.currency,
          paymentMethod: 'RAZORPAY',
          status: 'PENDING',
          razorpayOrderId: razorpayOrder.id,
        },
      });

      return {
        transactionId: transaction.id,
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount, // Amount in paise for frontend
        currency: razorpayOrder.currency,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to create payment order: ${message}`);
    }
  }

  async verifyPayment(userId: string, verifyPaymentDto: VerifyPaymentDto) {
    // Verify Razorpay signature
    const isValid = this.razorpayService.verifyPaymentSignature(
      verifyPaymentDto.razorpayOrderId,
      verifyPaymentDto.razorpayPaymentId,
      verifyPaymentDto.razorpaySignature
    );

    if (!isValid) {
      throw new BadRequestException('Invalid payment signature - payment verification failed');
    }

    // Find transaction
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        razorpayOrderId: verifyPaymentDto.razorpayOrderId,
        buyerId: userId,
      },
      include: {
        asset: true,
        seller: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Prevent double completion
    if (transaction.status === 'COMPLETED') {
      return {
        success: true,
        message: 'Payment already verified',
        transactionId: transaction.id,
      };
    }

    // Update transaction to completed
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        razorpayPaymentId: verifyPaymentDto.razorpayPaymentId,
        completedAt: new Date(),
      },
    });

    // Create notification for seller
    await this.createNotification(transaction.sellerId, {
      type: 'PURCHASE',
      title: 'New Sale! 🎉',
      message: `Your asset "${transaction.asset.title}" was purchased for ₹${transaction.amount}`,
      fromUserId: userId,
      actionUrl: `/asset/${transaction.assetId}`,
    });

    return {
      success: true,
      message: 'Payment verified successfully',
      transactionId: transaction.id,
    };
  }

  async getMyPurchases(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [purchases, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { buyerId: userId, status: 'COMPLETED' },
        skip,
        take: limit,
        orderBy: { completedAt: 'desc' },
        include: {
          asset: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              type: true,
              category: true,
              price: true,
            },
          },
          seller: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.transaction.count({
        where: { buyerId: userId, status: 'COMPLETED' },
      }),
    ]);

    // Transform thumbnail URLs to presigned URLs
    const purchasesWithPresignedUrls = await Promise.all(
      purchases.map(async (purchase) => ({
        ...purchase,
        asset: purchase.asset
          ? {
            ...purchase.asset,
            thumbnailUrl: purchase.asset.thumbnailUrl
              ? await this.storage.getPresignedUrl(purchase.asset.thumbnailUrl, 3600)
              : null,
          }
          : null,
        seller: purchase.seller
          ? {
            ...purchase.seller,
            avatarUrl: purchase.seller.avatarUrl
              ? await this.storage.getPresignedUrl(purchase.seller.avatarUrl, 3600)
              : null,
          }
          : null,
      }))
    );

    return {
      data: purchasesWithPresignedUrls,
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

  async getMySales(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [sales, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { sellerId: userId, status: 'COMPLETED' },
        skip,
        take: limit,
        orderBy: { completedAt: 'desc' },
        include: {
          asset: {
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              type: true,
              category: true,
              price: true,
            },
          },
          buyer: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.transaction.count({
        where: { sellerId: userId, status: 'COMPLETED' },
      }),
    ]);

    // Transform thumbnail URLs to presigned URLs
    const salesWithPresignedUrls = await Promise.all(
      sales.map(async (sale) => ({
        ...sale,
        asset: sale.asset
          ? {
            ...sale.asset,
            thumbnailUrl: sale.asset.thumbnailUrl
              ? await this.storage.getPresignedUrl(sale.asset.thumbnailUrl, 3600)
              : null,
          }
          : null,
        buyer: sale.buyer
          ? {
            ...sale.buyer,
            avatarUrl: sale.buyer.avatarUrl
              ? await this.storage.getPresignedUrl(sale.buyer.avatarUrl, 3600)
              : null,
          }
          : null,
      }))
    );

    return {
      data: salesWithPresignedUrls,
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

  async findOne(id: string, userId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        asset: true,
        buyer: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Check access permissions
    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new BadRequestException('You do not have access to this transaction');
    }

    // Transform URLs to presigned URLs
    if (transaction.asset?.thumbnailUrl) {
      transaction.asset.thumbnailUrl = await this.storage.getPresignedUrl(
        transaction.asset.thumbnailUrl,
        3600
      );
    }

    if (transaction.buyer?.avatarUrl) {
      transaction.buyer.avatarUrl = await this.storage.getPresignedUrl(
        transaction.buyer.avatarUrl,
        3600
      );
    }

    if (transaction.seller?.avatarUrl) {
      transaction.seller.avatarUrl = await this.storage.getPresignedUrl(
        transaction.seller.avatarUrl,
        3600
      );
    }

    return transaction;
  }

  private async createNotification(userId: string, data: any) {
    try {
      await this.prisma.notification.create({
        data: { userId, ...data },
      });
    } catch (error) {
      // Log but don't fail the transaction
      console.error('Failed to create notification:', error);
    }
  }
}
