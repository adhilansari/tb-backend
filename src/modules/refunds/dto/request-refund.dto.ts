import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestRefundDto {
  @ApiProperty({ description: 'Transaction ID to refund' })
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @ApiProperty({ description: 'Reason for requesting refund' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
