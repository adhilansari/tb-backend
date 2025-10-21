import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsEnum, Min } from 'class-validator';
import { Currency } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty({ description: 'Asset ID to purchase' })
  @IsString()
  assetId!: string;

  @ApiProperty({ description: 'Amount to pay' })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ enum: Currency, default: Currency.INR })
  @IsEnum(Currency)
  currency!: Currency;
}
