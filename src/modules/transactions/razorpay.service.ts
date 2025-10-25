import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly razorpay: Razorpay | null = null;
  private readonly keySecret: string;
  private readonly keyId: string;

  constructor(private readonly configService: ConfigService) {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    this.keyId = keyId || '';
    this.keySecret = keySecret || '';

    if (!keyId || !keySecret) {
      this.logger.warn('⚠️  Razorpay not configured - payment features disabled');
      return;
    }

    try {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });

      const mode = keyId.startsWith('rzp_test_') ? 'TEST' : 'LIVE';
      this.logger.log(`✅ Razorpay initialized in ${mode} mode`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? JSON.stringify(error) : 'Unknown error';
      this.logger.error(`Failed to initialize Razorpay: ${errorMessage}`);
    }
  }

  async createOrder(amount: number, currency: string, receipt: string): Promise<any> {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    // Validate amount
    if (!amount || amount <= 0) {
      throw new BadRequestException('Invalid amount: must be greater than 0');
    }

    // Convert rupees to paise (Razorpay requires amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    // Razorpay minimum is 100 paise (₹1)
    if (amountInPaise < 100) {
      throw new BadRequestException('Amount must be at least ₹1');
    }

    // Force INR for test mode
    const finalCurrency = this.keyId.startsWith('rzp_test_') ? 'INR' : currency.toUpperCase();

    try {
      const orderOptions = {
        amount: amountInPaise,
        currency: finalCurrency,
        receipt,
        payment_capture: 1, // Auto-capture payments
      };

      this.logger.log(
        `Creating order: ₹${amount} (${amountInPaise} paise), Currency: ${finalCurrency}, Receipt: ${receipt}`
      );

      const order = await this.razorpay.orders.create(orderOptions);

      return order;
    } catch (error: any) {
      this.logger.error(`❌ Razorpay order creation failed: ${JSON.stringify(error)}`);

      if (error.error) {
        this.logger.error(`Error details: ${JSON.stringify(error.error)}`);
      }

      // Handle specific Razorpay errors
      if (error.statusCode === 400) {
        const description: string = error.error?.description || 'Invalid order parameters';
        throw new BadRequestException(`Payment gateway error: ${description}`);
      }

      if (error.statusCode === 401) {
        throw new BadRequestException('Payment gateway authentication failed');
      }

      throw new BadRequestException(`Failed to create payment order: ${JSON.stringify(error)}`);
    }
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!this.keySecret) {
      this.logger.error('❌ Key secret not configured');
      return false;
    }

    if (!orderId || !paymentId || !signature) {
      this.logger.error('❌ Missing parameters for signature verification');
      return false;
    }

    try {
      // Razorpay signature format: orderId|paymentId
      const text = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(text)
        .digest('hex');

      const isValid = expectedSignature === signature;

      if (isValid) {
        this.logger.log(`✅ Payment signature verified: ${paymentId}`);
      } else {
        this.logger.warn(`❌ Invalid payment signature for payment: ${paymentId}`);
        this.logger.debug(`Expected: ${expectedSignature}, Received: ${signature}`);
      }

      return isValid;
    } catch (error) {
      this.logger.error(`Error verifying signature: ${JSON.stringify(error)}`);
      return false;
    }
  }

  async capturePayment(paymentId: string, amount: number, currency = 'INR'): Promise<any> {
    if (!this.razorpay) {
      throw new BadRequestException('Payment gateway not configured');
    }

    const amountInPaise = Math.round(amount * 100);

    try {
      this.logger.log(`Capturing payment: ${paymentId}, Amount: ${amountInPaise} paise`);

      const payment = await this.razorpay.payments.capture(paymentId, amountInPaise, currency);

      this.logger.log(`✅ Payment captured: ${payment.id}`);
      return payment;
    } catch (error: any) {
      this.logger.error(`❌ Payment capture failed: ${JSON.stringify(error)}`);

      if (error.error) {
        this.logger.error(`Error details: ${JSON.stringify(error.error)}`);
      }

      throw new BadRequestException(`Failed to capture payment: ${JSON.stringify(error)}`);
    }
  }

  getKeyId(): string {
    return this.keyId;
  }

  isConfigured(): boolean {
    return this.razorpay !== null;
  }
}
