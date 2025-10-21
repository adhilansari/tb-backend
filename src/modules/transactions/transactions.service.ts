import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { RazorpayService } from './razorpay.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
  ) {}

  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: createOrderDto.assetId },
      include: { creator: true },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.isFree) {
      throw new BadRequestException('This asset is free');
    }

    if (asset.creatorId === userId) {
      throw new BadRequestException('You cannot purchase your own asset');
    }

    const existing = await this.prisma.transaction.findFirst({
      where: {
        buyerId: userId,
        assetId: asset.id,
        status: 'COMPLETED',
      },
    });

    if (existing) {
      throw new BadRequestException('You have already purchased this asset');
    }

    const receipt = `order_${Date.now()}_${userId.substring(0, 8)}`;

    const razorpayOrder = await this.razorpayService.createOrder(
      createOrderDto.amount,
      createOrderDto.currency,
      receipt,
    );

    const transaction = await this.prisma.transaction.create({
      data: {
        buyerId: userId,
        sellerId: asset.creatorId,
        assetId: asset.id,
        amount: createOrderDto.amount,
        currency: createOrderDto.currency,
        paymentMethod: 'RAZORPAY',
        status: 'PENDING',
        razorpayOrderId: razorpayOrder.id,
      },
    });

    return {
      transactionId: transaction.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    };
  }

  async verifyPayment(userId: string, verifyPaymentDto: VerifyPaymentDto) {
    const isValid = this.razorpayService.verifyPaymentSignature(
      verifyPaymentDto.razorpayOrderId,
      verifyPaymentDto.razorpayPaymentId,
      verifyPaymentDto.razorpaySignature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    const transaction = await this.prisma.transaction.findFirst({
      where: {
        razorpayOrderId: verifyPaymentDto.razorpayOrderId,
        buyerId: userId,
      },
      include: { asset: true, seller: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        razorpayPaymentId: verifyPaymentDto.razorpayPaymentId,
        completedAt: new Date(),
      },
    });

    await this.createNotification(transaction.sellerId, {
      type: 'PURCHASE',
      title: 'New Sale!',
      message: `Your asset "${transaction.asset.title}" was purchased`,
      fromUserId: userId,
      actionUrl: `/asset/${transaction.assetId}`,
    });

    return {
      success: true,
      message: 'Payment verified successfully',
      transactionId: transaction.id,
    };
  }

  async getMyPurchases(userId: string, page: number = 1, limit: number = 20) {
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

    return {
      data: purchases,
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

  async getMySales(userId: string, page: number = 1, limit: number = 20) {
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

    return {
      data: sales,
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

    if (transaction.buyerId !== userId && transaction.sellerId !== userId) {
      throw new BadRequestException('You do not have access to this transaction');
    }

    return transaction;
  }

  private async createNotification(userId: string, data: any) {
    await this.prisma.notification.create({
      data: { userId, ...data },
    });
  }
}
