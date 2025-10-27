// File: src/modules/payments/razorpay.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService {
  private razorpay: Razorpay | null = null;

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');

    if (!keyId || !keySecret) {
      console.warn('⚠️ Razorpay credentials not configured. Payment features will be disabled.');
    } else {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      console.log('✅ Razorpay initialized successfully');
    }
  }

  /**
   * Create Razorpay order
   */
  async createOrder(params: {
    amount: number; // in currency units (e.g., 100 INR)
    currency: string;
    receipt: string;
    notes?: Record<string, any>;
  }) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured. Please contact support.');
    }

    try {
      // Razorpay requires amount in paise (multiply by 100)
      const amountInPaise = Math.round(params.amount * 100);

      const order = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
      });

      console.log('✅ Razorpay order created:', {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      });

      return order;
    } catch (error) {
      console.error('❌ Razorpay order creation failed:', error);
      throw new BadRequestException('Failed to create payment order. Please try again.');
    }
  }

  /**
   * Verify Razorpay payment signature
   */
  verifyPaymentSignature(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      const crypto = require('crypto');
      const generatedSignature = crypto
        .createHmac('sha256', this.config.get<string>('RAZORPAY_KEY_SECRET'))
        .update(`${params.orderId}|${params.paymentId}`)
        .digest('hex');

      const isValid = generatedSignature === params.signature;

      console.log('🔐 Payment signature verification:', {
        orderId: params.orderId,
        paymentId: params.paymentId,
        isValid,
      });

      return isValid;
    } catch (error) {
      console.error('❌ Payment signature verification failed:', error);
      return false;
    }
  }

  /**
   * Fetch payment details
   */
  async fetchPayment(paymentId: string) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      const payment = await this.razorpay.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      console.error('❌ Failed to fetch payment details:', error);
      throw new BadRequestException('Failed to fetch payment details');
    }
  }

  /**
   * Check if Razorpay is configured
   */
  isConfigured(): boolean {
    return !!this.razorpay;
  }

  /**
   * Create Razorpay Payout (Transfer to creator)
   * Uses Razorpay Payouts API for Indian bank transfers and UPI
   */
  async createPayout(params: {
    accountNumber: string; // Your Razorpay Account Number
    amount: number; // in currency units (e.g., 880 INR)
    currency: string;
    mode: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS';
    purpose: string;
    fundAccountId?: string; // If fund account already created
    contact?: {
      name: string;
      email?: string;
      contact?: string;
      type: 'customer';
    };
    fundAccount?: {
      account_type: 'bank_account' | 'vpa';
      bank_account?: {
        name: string;
        ifsc: string;
        account_number: string;
      };
      vpa?: {
        address: string; // UPI ID
      };
    };
    reference_id?: string;
  }) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      // Amount in paise
      const amountInPaise = Math.round(params.amount * 100);

      // Create payout
      const payout = await (this.razorpay as any).payouts.create({
        account_number: params.accountNumber,
        fund_account_id: params.fundAccountId,
        amount: amountInPaise,
        currency: params.currency,
        mode: params.mode,
        purpose: params.purpose,
        queue_if_low_balance: true,
        reference_id: params.reference_id,
        narration: `Payout for ${params.purpose}`,
      });

      console.log('✅ Razorpay payout created:', {
        id: payout.id,
        amount: payout.amount,
        status: payout.status,
        mode: payout.mode,
      });

      return payout;
    } catch (error) {
      console.error('❌ Razorpay payout creation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to create payout: ${errorMessage}`);
    }
  }

  /**
   * Create Fund Account for a creator (one-time setup)
   * This links the creator's bank account or UPI ID with Razorpay
   */
  async createFundAccount(params: {
    contact: {
      name: string;
      email?: string;
      contact?: string;
      type: 'customer';
    };
    account_type: 'bank_account' | 'vpa';
    bank_account?: {
      name: string;
      ifsc: string;
      account_number: string;
    };
    vpa?: {
      address: string; // UPI ID
    };
  }) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      // First create contact
      const contact = await (this.razorpay as any).contacts.create(params.contact);

      // Then create fund account linked to contact
      const fundAccount = await (this.razorpay as any).fundAccount.create({
        contact_id: contact.id,
        account_type: params.account_type,
        bank_account: params.bank_account,
        vpa: params.vpa,
      });

      console.log('✅ Razorpay fund account created:', {
        id: fundAccount.id,
        accountType: fundAccount.account_type,
        contactId: contact.id,
      });

      return {
        fundAccountId: fundAccount.id,
        contactId: contact.id,
        accountType: fundAccount.account_type,
      };
    } catch (error) {
      console.error('❌ Razorpay fund account creation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to create fund account: ${errorMessage}`);
    }
  }

  /**
   * Fetch payout details
   */
  async fetchPayout(payoutId: string) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      const payout = await (this.razorpay as any).payouts.fetch(payoutId);
      return payout;
    } catch (error) {
      console.error('❌ Failed to fetch payout details:', error);
      throw new BadRequestException('Failed to fetch payout details');
    }
  }

  /**
   * Create refund for a payment
   */
  async createRefund(params: {
    paymentId: string;
    amount?: number; // Optional, full refund if not provided
    notes?: Record<string, any>;
  }) {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      const refundData: any = {
        payment_id: params.paymentId,
        notes: params.notes,
      };

      // If amount specified, add it (in paise)
      if (params.amount) {
        refundData.amount = Math.round(params.amount * 100);
      }

      const refund = await (this.razorpay as any).payments.refund(params.paymentId, refundData);

      console.log('✅ Razorpay refund created:', {
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
      });

      return refund;
    } catch (error) {
      console.error('❌ Razorpay refund creation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to create refund: ${errorMessage}`);
    }
  }
}
