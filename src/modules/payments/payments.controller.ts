// File: src/modules/payments/payments.controller.ts
import { Controller, Post, Body, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payment order for asset purchase' })
  async createOrder(@Request() req: any, @Body() body: { assetId: string }) {
    return this.paymentsService.createPaymentOrder(req.user.id, body.assetId);
  }

  @Post('verify')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and complete payment' })
  async verifyPayment(
    @Body()
    body: {
      transactionId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }
  ) {
    return this.paymentsService.verifyPayment(body);
  }

  @Post('commission-info')
  @ApiOperation({ summary: 'Get commission breakdown for an amount (public)' })
  async getCommissionInfo(@Body() body: { amount: number }) {
    return this.paymentsService.calculateCommission(body.amount);
  }
}
