import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { AssetType, AssetCategory } from '@prisma/client';

export class SearchFiltersDto {
  @ApiPropertyOptional({ description: 'Search query' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ enum: AssetType, description: 'Filter by asset type' })
  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  @ApiPropertyOptional({ enum: AssetCategory, description: 'Filter by category' })
  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;
}
