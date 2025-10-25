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
import { FollowsService } from './follows.service';
import { ToggleFollowDto } from './dto/toggle-follow.dto';

@ApiTags('Follows')
@ApiBearerAuth()
@Controller('follows')
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  @Post('toggle')
  @ApiOperation({ summary: 'Toggle follow on a user' })
  @ApiResponse({ status: 200, description: 'Follow toggled successfully' })
  async toggleFollow(
    @Request() req: any,
    @Body() toggleFollowDto: ToggleFollowDto,
  ) {
    return this.followsService.toggleFollow(
      req.user.id,
      toggleFollowDto.targetUserId,
    );
  }

  @Get('status/:userId')
  @ApiOperation({ summary: 'Check if current user is following a user' })
  @ApiResponse({ status: 200, description: 'Follow status returned' })
  async checkFollowStatus(
    @Request() req: any,
    @Param('userId') userId: string,
  ) {
    return this.followsService.checkFollowStatus(req.user.id, userId);
  }

  @Get('followers/:userId')
  @ApiOperation({ summary: "Get a user's followers" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFollowers(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.followsService.getFollowers(userId, page, limit);
  }

  @Get('following/:userId')
  @ApiOperation({ summary: 'Get users that a user is following' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFollowing(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.followsService.getFollowing(userId, page, limit);
  }

  @Get('stats/:userId')
  @ApiOperation({ summary: 'Get follow stats for a user' })
  @ApiResponse({ status: 200, description: 'Follow stats returned' })
  async getFollowStats(@Param('userId') userId: string) {
    return this.followsService.getFollowStats(userId);
  }
}
