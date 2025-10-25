import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleFollowDto {
  @ApiProperty({ description: 'ID of the user to follow/unfollow' })
  @IsString()
  @IsNotEmpty()
  targetUserId!: string;
}
