import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { ProfileVisibility, Currency } from '@prisma/client';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Email notifications enabled' })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Push notifications enabled' })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Marketing emails enabled' })
  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @ApiPropertyOptional({ description: 'Notify on new followers' })
  @IsOptional()
  @IsBoolean()
  notifyNewFollowers?: boolean;

  @ApiPropertyOptional({ description: 'Notify on comments' })
  @IsOptional()
  @IsBoolean()
  notifyComments?: boolean;

  @ApiPropertyOptional({ description: 'Notify on likes' })
  @IsOptional()
  @IsBoolean()
  notifyLikes?: boolean;

  @ApiPropertyOptional({ description: 'Notify on purchases' })
  @IsOptional()
  @IsBoolean()
  notifyPurchases?: boolean;

  @ApiPropertyOptional({ enum: ProfileVisibility })
  @IsOptional()
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;

  @ApiPropertyOptional({ description: 'Show email on profile' })
  @IsOptional()
  @IsBoolean()
  showEmail?: boolean;

  @ApiPropertyOptional({ description: 'Show purchases on profile' })
  @IsOptional()
  @IsBoolean()
  showPurchases?: boolean;

  @ApiPropertyOptional({ description: 'Allow messages from other users' })
  @IsOptional()
  @IsBoolean()
  allowMessages?: boolean;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ description: 'PayPal email for payments' })
  @IsOptional()
  @IsEmail()
  paypalEmail?: string;
}
