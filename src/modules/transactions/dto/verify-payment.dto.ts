import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ description: 'Razorpay order ID' })
  @IsString()
  razorpayOrderId!: string;

  @ApiProperty({ description: 'Razorpay payment ID' })
  @IsString()
  razorpayPaymentId!: string;

  @ApiProperty({ description: 'Razorpay signature' })
  @IsString()
  razorpaySignature!: string;
}
