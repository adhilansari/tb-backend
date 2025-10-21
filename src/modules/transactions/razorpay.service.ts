import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly razorpay: Razorpay | null = null;
  private readonly keySecret: string;

  constructor(private readonly configService: ConfigService) {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    this.keySecret = keySecret || '';

    if (!keyId || !keySecret) {
      this.logger.warn('⚠️  Razorpay not configured - payment features disabled');
      return;
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    this.logger.log('✅ Razorpay payment gateway initialized');
  }

  async createOrder(amount: number, currency: string, receipt: string): Promise<any> {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      const order = await this.razorpay.orders.create({
        amount: Math.round(amount * 100), // Convert to paise
        currency: currency.toUpperCase(),
        receipt,
      });

      this.logger.log(`Order created: ${order.id}`);
      return order;
    } catch (error) {
      this.logger.error(`Failed to create Razorpay order: ${error}`);
      throw new BadRequestException('Failed to create payment order');
    }
  }

  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(text)
      .digest('hex');

    return expectedSignature === signature;
  }

  async capturePayment(paymentId: string, amount: number): Promise<any> {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    try {
      const payment = await this.razorpay.payments.capture(
        paymentId,
        Math.round(amount * 100),
        'INR',
      );
      return payment;
    } catch (error) {
      this.logger.error(`Failed to capture payment: ${error}`);
      throw new BadRequestException('Failed to capture payment');
    }
  }
}
