import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsEnum, IsArray, IsOptional, Min, Max } from 'class-validator';
import { AssetType, AssetCategory, Currency } from '@prisma/client';

export class CreateAssetDto {
  @ApiProperty({ enum: AssetType })
  @IsEnum(AssetType)
  type!: AssetType;

  @ApiProperty({ enum: AssetCategory })
  @IsEnum(AssetCategory)
  category!: AssetCategory;

  @ApiProperty({ description: 'Asset title', maxLength: 200 })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Asset description' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Price in selected currency' })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ description: 'Is this asset free?' })
  @IsBoolean()
  isFree!: boolean;

  @ApiProperty({ enum: Currency, default: Currency.USD })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiPropertyOptional({ description: 'Discount percentage', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;

  @ApiProperty({ description: 'Tags array', type: [String] })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @ApiPropertyOptional({ description: 'Version number' })
  @IsOptional()
  @IsString()
  version?: string;
}
