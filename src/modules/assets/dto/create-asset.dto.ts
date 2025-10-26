// ============================================
// FILE: src/modules/assets/dto/create-asset.dto.ts
// ============================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { AssetType, AssetCategory, Currency } from '@prisma/client';
import { Transform } from 'class-transformer';

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
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ description: 'Is this asset free?' })
  @Transform(({ value }) => {
    console.log('🔄 [CREATE DTO TRANSFORM] isFree value:', {
      raw: value,
      type: typeof value,
      isString: typeof value === 'string',
      stringValue: String(value),
    });

    // Handle string values (from FormData)
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();

      // CRITICAL: Check for "false" explicitly FIRST
      if (lowerValue === 'false' || lowerValue === '0') {
        console.log('✅ [CREATE DTO TRANSFORM] String "false" → boolean FALSE');
        return false;
      }

      // Then check for "true"
      if (lowerValue === 'true' || lowerValue === '1') {
        console.log('✅ [CREATE DTO TRANSFORM] String "true" → boolean TRUE');
        return true;
      }

      // Unknown string defaults to false
      console.log('⚠️ [CREATE DTO TRANSFORM] Unknown string, defaulting to FALSE');
      return false;
    }

    // Handle boolean values
    if (typeof value === 'boolean') {
      console.log('✅ [CREATE DTO TRANSFORM] Already boolean:', value);
      return value;
    }

    // Handle numeric values
    if (typeof value === 'number') {
      const result = value === 1;
      console.log('✅ [CREATE DTO TRANSFORM] Number to boolean:', { input: value, output: result });
      return result;
    }

    // Fallback
    console.log('⚠️ [CREATE DTO TRANSFORM] Fallback to false for:', value);
    return false;
  })
  @IsBoolean()
  isFree!: boolean;

  @ApiProperty({ enum: Currency, default: Currency.USD })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiPropertyOptional({ description: 'Discount percentage', minimum: 0, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) =>
    value ? (typeof value === 'string' ? parseFloat(value) : value) : undefined
  )
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;

  @ApiProperty({ description: 'Tags array', type: [String] })
  @Transform(({ value }) => {
    // Handle JSON string from FormData
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @ApiPropertyOptional({ description: 'Version number' })
  @IsOptional()
  @IsString()
  version?: string;
}
