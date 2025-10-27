// File: src/modules/payments/payouts.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Payouts Service
 * Handles automatic creator payouts after escrow period
 * Supports Indian bank transfers and UPI via Razorpay Payouts
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron job: Process automatic payouts (runs daily at 2 AM)
   * Releases funds to creators after 7-day escrow period
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async processAutomaticPayouts() {
    this.logger.log('🔄 Starting automatic payout processing...');

    try {
      // Find all transactions where escrow period has ended
      const now = new Date();
      const readyForPayout = await this.prisma.transaction.findMany({
        where: {
          status: 'COMPLETED',
          escrowStatus: 'HELD',
          escrowReleaseDate: {
            lte: now, // Escrow release date has passed
          },
          isRefundable: true, // No refund requested
        },
        include: {
          seller: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
            },
          },
          asset: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      this.logger.log(`📊 Found ${readyForPayout.length} transactions ready for payout`);

      for (const transaction of readyForPayout) {
        try {
          await this.initiateCreatorPayout(transaction);
        } catch (error) {
          this.logger.error(
            `❌ Failed to process payout for transaction ${transaction.id}:`,
            error
          );
        }
      }

      this.logger.log('✅ Automatic payout processing completed');
    } catch (error) {
      this.logger.error('❌ Automatic payout processing failed:', error);
    }
  }

  /**
   * Initiate payout to creator
   * Creates payout record and marks escrow as released
   */
  async initiateCreatorPayout(transaction: any) {
    this.logger.log(`💰 Initiating payout for transaction ${transaction.id}`);

    // Create payout record
    const payout = await this.prisma.payout.create({
      data: {
        creatorId: transaction.sellerId,
        transactionId: transaction.id,
        grossAmount: transaction.amount,
        platformFee: transaction.platformFeeAmount,
        netAmount: transaction.creatorAmount,
        currency: transaction.currency,
        status: 'PENDING',
        // Reconciliation report (JSON)
        reconciliationReport: JSON.stringify({
          transactionId: transaction.id,
          assetTitle: transaction.asset.title,
          buyerUsername: transaction.buyer?.username || 'Unknown',
          saleDate: transaction.completedAt,
          grossAmount: transaction.amount,
          platformFeePercentage: transaction.platformFeePercentage,
          platformFee: transaction.platformFeeAmount,
          creatorAmount: transaction.creatorAmount,
          currency: transaction.currency,
          paymentMethod: transaction.razorpayPaymentMethod,
          escrowReleaseDate: transaction.escrowReleaseDate,
        }),
      },
    });

    // Update transaction escrow status
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        escrowStatus: 'RELEASED',
        escrowReleasedAt: new Date(),
      },
    });

    // Send notification to creator
    await this.prisma.notification.create({
      data: {
        userId: transaction.sellerId,
        type: 'SYSTEM',
        title: 'Payout Initiated',
        message: `Your payout of ${transaction.creatorAmount} ${transaction.currency} for "${transaction.asset.title}" has been initiated. Funds will arrive within 1-3 business days.`,
        actionUrl: `/dashboard/earnings`,
      },
    });

    this.logger.log(
      `✅ Payout created: ${payout.id} for ${transaction.creatorAmount} ${transaction.currency}`
    );

    return payout;
  }

  /**
   * Get creator earnings summary
   */
  async getCreatorEarnings(creatorId: string) {
    // Total sales (all time)
    const totalSales = await this.prisma.transaction.aggregate({
      where: {
        sellerId: creatorId,
        status: 'COMPLETED',
      },
      _sum: {
        amount: true,
        platformFeeAmount: true,
        creatorAmount: true,
      },
      _count: true,
    });

    // Pending in escrow
    const pendingEscrow = await this.prisma.transaction.aggregate({
      where: {
        sellerId: creatorId,
        status: 'COMPLETED',
        escrowStatus: 'HELD',
      },
      _sum: {
        creatorAmount: true,
      },
      _count: true,
    });

    // Released payouts (pending/processing)
    const pendingPayouts = await this.prisma.payout.aggregate({
      where: {
        creatorId,
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
      _sum: {
        netAmount: true,
      },
      _count: true,
    });

    // Completed payouts
    const completedPayouts = await this.prisma.payout.aggregate({
      where: {
        creatorId,
        status: 'COMPLETED',
      },
      _sum: {
        netAmount: true,
      },
      _count: true,
    });

    return {
      totalSales: {
        count: totalSales._count || 0,
        grossAmount: totalSales._sum.amount || 0,
        platformFee: totalSales._sum.platformFeeAmount || 0,
        netAmount: totalSales._sum.creatorAmount || 0,
      },
      pendingEscrow: {
        count: pendingEscrow._count || 0,
        amount: pendingEscrow._sum.creatorAmount || 0,
      },
      pendingPayouts: {
        count: pendingPayouts._count || 0,
        amount: pendingPayouts._sum.netAmount || 0,
      },
      completedPayouts: {
        count: completedPayouts._count || 0,
        amount: completedPayouts._sum.netAmount || 0,
      },
      availableBalance:
        (pendingPayouts._sum.netAmount || 0) + (completedPayouts._sum.netAmount || 0),
    };
  }

  /**
   * Get payout history for creator
   */
  async getPayoutHistory(creatorId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [payouts, total] = await Promise.all([
      this.prisma.payout.findMany({
        where: { creatorId },
        include: {
          transaction: {
            include: {
              asset: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payout.count({ where: { creatorId } }),
    ]);

    return {
      data: payouts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get detailed payout by ID
   */
  async getPayoutById(payoutId: string, creatorId: string) {
    const payout = await this.prisma.payout.findFirst({
      where: {
        id: payoutId,
        creatorId,
      },
      include: {
        transaction: {
          include: {
            asset: true,
            buyer: {
              select: {
                username: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!payout) {
      throw new BadRequestException('Payout not found');
    }

    return payout;
  }

  /**
   * Get transactions pending payout (in escrow)
   */
  async getPendingEscrowTransactions(creatorId: string) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        sellerId: creatorId,
        status: 'COMPLETED',
        escrowStatus: 'HELD',
      },
      include: {
        asset: {
          select: {
            id: true,
            title: true,
          },
        },
        buyer: {
          select: {
            username: true,
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    return transactions.map((transaction) => ({
      ...transaction,
      daysUntilRelease: Math.ceil(
        (transaction.escrowReleaseDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      ),
    }));
  }
}
