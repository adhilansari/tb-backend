// File: src/modules/payments/payments.service.ts
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { RazorpayService } from './razorpay.service';

@Injectable()
export class PaymentsService {
  // Platform commission percentage
  private readonly PLATFORM_FEE_PERCENTAGE = 12.0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService
  ) {}

  /**
   * Calculate commission breakdown
   */
  calculateCommission(amount: number): {
    totalAmount: number;
    platformFeePercentage: number;
    platformFeeAmount: number;
    creatorAmount: number;
  } {
    const platformFeeAmount = Number(((amount * this.PLATFORM_FEE_PERCENTAGE) / 100).toFixed(2));
    const creatorAmount = Number((amount - platformFeeAmount).toFixed(2));

    return {
      totalAmount: amount,
      platformFeePercentage: this.PLATFORM_FEE_PERCENTAGE,
      platformFeeAmount,
      creatorAmount,
    };
  }

  /**
   * Create payment order for asset purchase
   */
  async createPaymentOrder(userId: string, assetId: string) {
    // Fetch asset details
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    if (asset.isFree) {
      throw new BadRequestException('This asset is free');
    }

    if (asset.creatorId === userId) {
      throw new BadRequestException('Cannot purchase your own asset');
    }

    // Check if already purchased
    const existingPurchase = await this.prisma.transaction.findFirst({
      where: {
        assetId,
        buyerId: userId,
        status: 'COMPLETED',
      },
    });

    if (existingPurchase) {
      throw new BadRequestException('You already own this asset');
    }

    // Calculate commission breakdown
    const commission = this.calculateCommission(asset.price);

    // Create Razorpay order
    const razorpayOrder = await this.razorpay.createOrder({
      amount: asset.price,
      currency: asset.currency,
      receipt: `asset_${assetId}_${Date.now()}`,
      notes: {
        assetId,
        assetTitle: asset.title,
        buyerId: userId,
        sellerId: asset.creatorId,
        platformFee: commission.platformFeeAmount,
        creatorAmount: commission.creatorAmount,
      },
    });

    // Create pending transaction
    const transaction = await this.prisma.transaction.create({
      data: {
        buyerId: userId,
        sellerId: asset.creatorId,
        assetId,
        amount: asset.price,
        currency: asset.currency,
        paymentMethod: 'RAZORPAY',
        status: 'PENDING',
        platformFeePercentage: commission.platformFeePercentage,
        platformFeeAmount: commission.platformFeeAmount,
        creatorAmount: commission.creatorAmount,
        razorpayOrderId: razorpayOrder.id,
      },
    });

    console.log('✅ Payment order created:', {
      transactionId: transaction.id,
      razorpayOrderId: razorpayOrder.id,
      amount: asset.price,
      platformFee: commission.platformFeeAmount,
      creatorAmount: commission.creatorAmount,
    });

    return {
      transactionId: transaction.id,
      razorpayOrderId: razorpayOrder.id,
      amount: asset.price,
      currency: asset.currency,
      commission,
      asset: {
        id: asset.id,
        title: asset.title,
        creator: asset.creator,
      },
    };
  }

  /**
   * Verify and complete payment with escrow setup
   */
  async verifyPayment(params: {
    transactionId?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) {
    // Verify signature
    const isValid = this.razorpay.verifyPaymentSignature({
      orderId: params.razorpayOrderId,
      paymentId: params.razorpayPaymentId,
      signature: params.razorpaySignature,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    // Fetch payment details from Razorpay to get payment method
    const paymentDetails = await this.razorpay.fetchPayment(params.razorpayPaymentId);

    // Find transaction by razorpay order ID if transactionId not provided
    let { transactionId } = params;
    if (!transactionId) {
      const transaction = await this.prisma.transaction.findFirst({
        where: { razorpayOrderId: params.razorpayOrderId },
      });
      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }
      transactionId = transaction.id;
    }

    // Calculate escrow dates (7-day hold)
    const completedAt = new Date();
    const escrowReleaseDate = new Date(completedAt);
    escrowReleaseDate.setDate(escrowReleaseDate.getDate() + 7); // 7 days from now

    const refundDeadline = new Date(completedAt);
    refundDeadline.setDate(refundDeadline.getDate() + 7); // Refundable within 7 days

    // Update transaction with escrow logic
    const transaction = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        razorpayPaymentId: params.razorpayPaymentId,
        razorpayPaymentMethod: paymentDetails.method || 'unknown', // UPI, card, netbanking, etc.
        completedAt,
        // Escrow fields
        escrowStatus: 'HELD',
        escrowReleaseDate,
        refundDeadline,
        isRefundable: true,
      },
      include: {
        asset: {
          select: {
            id: true,
            title: true,
            creatorId: true,
          },
        },
        buyer: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Send notification to creator about sale (but funds are in escrow)
    await this.prisma.notification.create({
      data: {
        userId: transaction.asset.creatorId,
        type: 'NEW_SALE',
        title: 'New Sale!',
        message: `${transaction.buyer.username} purchased "${transaction.asset.title}" - You will receive ${transaction.creatorAmount} ${transaction.currency} after 7-day escrow period`,
        actionUrl: `/dashboard/earnings`,
      },
    });

    console.log('✅ Payment verified and escrowed:', {
      transactionId: transaction.id,
      amount: transaction.amount,
      creatorAmount: transaction.creatorAmount,
      platformFee: transaction.platformFeeAmount,
      paymentMethod: transaction.razorpayPaymentMethod,
      escrowReleaseDate: escrowReleaseDate.toISOString(),
      refundDeadline: refundDeadline.toISOString(),
    });

    return transaction;
  }
}
