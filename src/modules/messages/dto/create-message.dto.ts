import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    description: 'Message content',
    example: 'Hello! I am interested in your digital asset.',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  @ApiProperty({
    description: 'Optional attachment URL',
    required: false,
  })
  @IsString()
  @IsOptional()
  attachmentUrl?: string;

  @ApiProperty({
    description: 'Optional attachment type (image, asset, link)',
    required: false,
  })
  @IsString()
  @IsOptional()
  attachmentType?: string;
}

export class StartConversationDto {
  @ApiProperty({
    description: 'ID of the user to start conversation with',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  receiverId!: string;

  @ApiProperty({
    description: 'Initial message content',
    example: 'Hi! I would like to discuss your asset',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}
