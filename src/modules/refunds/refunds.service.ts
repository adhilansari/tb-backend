import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { RazorpayService } from '@/modules/payments/razorpay.service';
import { RequestRefundDto } from './dto/request-refund.dto';

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService
  ) {}

  /**
   * Request a refund for a transaction
   */
  async requestRefund(userId: string, dto: RequestRefundDto) {
    // Find the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
      include: {
        asset: {
          select: {
            title: true,
            creatorId: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Verify the user is the buyer
    if (transaction.buyerId !== userId) {
      throw new ForbiddenException('You can only request refunds for your own purchases');
    }

    // Check if transaction is completed
    if (transaction.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed transactions can be refunded');
    }

    // Check if still in escrow period (7 days)
    if (transaction.escrowStatus !== 'HELD') {
      throw new BadRequestException('This transaction is no longer eligible for refund');
    }

    const now = new Date();
    if (!transaction.completedAt) {
      throw new BadRequestException('Transaction is not completed yet');
    }
    const completedDate = new Date(transaction.completedAt);
    const daysSincePurchase = Math.floor(
      (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSincePurchase > 7) {
      throw new BadRequestException('Refund period has expired (7 days)');
    }

    // Check if refund already exists
    const existingRefund = await this.prisma.refund.findFirst({
      where: { transactionId: dto.transactionId },
    });

    if (existingRefund) {
      throw new BadRequestException('Refund request already exists for this transaction');
    }

    // Create refund record
    const refund = await this.prisma.refund.create({
      data: {
        transactionId: dto.transactionId,
        buyerId: userId,
        amount: transaction.amount,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: {
        transaction: {
          include: {
            asset: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    console.log('✅ Refund request created:', {
      refundId: refund.id,
      transactionId: dto.transactionId,
      amount: transaction.amount,
      reason: dto.reason,
    });

    return {
      success: true,
      message: 'Refund request submitted successfully. We will review it within 24 hours.',
      refund: {
        id: refund.id,
        status: refund.status,
        amount: refund.amount,
        createdAt: refund.createdAt,
      },
    };
  }

  /**
   * Process a refund (auto-approve if within policy)
   */
  async processRefund(refundId: string) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: {
        transaction: true,
      },
    });

    if (!refund) {
      throw new NotFoundException('Refund not found');
    }

    if (refund.status !== 'PENDING') {
      throw new BadRequestException('Refund has already been processed');
    }

    try {
      // Process Razorpay refund
      if (this.razorpay.isConfigured() && refund.transaction.razorpayPaymentId) {
        const razorpayRefund = await this.razorpay.createRefund({
          paymentId: refund.transaction.razorpayPaymentId,
          amount: refund.amount,
          notes: {
            refundId: refund.id,
            reason: refund.reason,
          },
        });

        // Update refund with Razorpay details
        await this.prisma.refund.update({
          where: { id: refundId },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            completedAt: new Date(),
            razorpayRefundId: razorpayRefund.id,
          },
        });

        // Update transaction escrow status
        await this.prisma.transaction.update({
          where: { id: refund.transactionId },
          data: {
            escrowStatus: 'REFUNDED',
          },
        });

        console.log('✅ Refund processed successfully:', {
          refundId,
          razorpayRefundId: razorpayRefund.id,
          amount: refund.amount,
        });

        return {
          success: true,
          message: 'Refund processed successfully',
          refund: {
            id: refundId,
            status: 'APPROVED',
            razorpayRefundId: razorpayRefund.id,
          },
        };
      } else {
        throw new BadRequestException('Payment gateway not configured or payment ID missing');
      }
    } catch (error) {
      console.error('❌ Failed to process refund:', error);

      // Update refund status to failed
      await this.prisma.refund.update({
        where: { id: refundId },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
        },
      });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to process refund: ${errorMessage}`);
    }
  }

  /**
   * Get all refund requests (for admin)
   */
  async getAllRefunds(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [refunds, total] = await Promise.all([
      this.prisma.refund.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          transaction: {
            include: {
              asset: {
                select: {
                  title: true,
                  thumbnailUrl: true,
                },
              },
              buyer: {
                select: {
                  username: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.refund.count(),
    ]);

    return {
      data: refunds,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user's refund requests
   */
  async getMyRefunds(userId: string) {
    const refunds = await this.prisma.refund.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        transaction: {
          include: {
            asset: {
              select: {
                title: true,
                thumbnailUrl: true,
              },
            },
          },
        },
      },
    });

    return refunds;
  }
}
