import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleLikeDto {
  @ApiProperty({ description: 'ID of the asset to like/unlike' })
  @IsString()
  @IsNotEmpty()
  assetId!: string;
}
