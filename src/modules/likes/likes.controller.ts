import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { LikesService } from './likes.service';
import { ToggleLikeDto } from './dto/toggle-like.dto';

@ApiTags('Likes')
@ApiBearerAuth()
@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post('toggle')
  @ApiOperation({ summary: 'Toggle like on an asset' })
  @ApiResponse({ status: 200, description: 'Like toggled successfully' })
  async toggleLike(@Request() req: any, @Body() toggleLikeDto: ToggleLikeDto) {
    return this.likesService.toggleLike(req.user.id, toggleLikeDto.assetId);
  }

  @Get('status/:assetId')
  @ApiOperation({ summary: 'Check if user has liked an asset' })
  @ApiResponse({ status: 200, description: 'Like status returned' })
  async checkLikeStatus(
    @Request() req: any,
    @Param('assetId') assetId: string,
  ) {
    return this.likesService.checkLikeStatus(req.user.id, assetId);
  }

  @Get('user')
  @ApiOperation({ summary: "Get current user's liked assets" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserLikes(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.likesService.getUserLikes(req.user.id, page, limit);
  }
}
