import {
  Controller,
  Get,
  Post,
  Delete,
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
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a comment on an asset' })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  async create(@Request() req: any, @Body() createCommentDto: CreateCommentDto) {
    return this.commentsService.create(
      req.user.id,
      createCommentDto.assetId,
      createCommentDto.text,
      createCommentDto.parentId,
    );
  }

  @Get('asset/:assetId')
  @ApiOperation({ summary: 'Get comments for an asset' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAssetComments(
    @Param('assetId') assetId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.commentsService.findByAsset(assetId, page, limit);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a comment' })
  @ApiResponse({ status: 200, description: 'Comment deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this comment' })
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.commentsService.delete(id, req.user.id);
  }
}
