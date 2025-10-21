import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ description: 'Comment text', maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  text!: string;

  @ApiProperty({ description: 'Asset ID' })
  @IsString()
  assetId!: string;

  @ApiPropertyOptional({ description: 'Parent comment ID for replies' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
