import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { AssetFiltersDto } from './dto/asset-filters.dto';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new asset with file upload' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['thumbnail', 'type', 'category', 'title', 'description', 'price', 'isFree', 'currency', 'tags'],
      properties: {
        thumbnail: { type: 'string', format: 'binary' },
        assetFile: { type: 'string', format: 'binary' },
        type: { type: 'string' },
        category: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'number' },
        isFree: { type: 'boolean' },
        currency: { type: 'string' },
        discount: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
        version: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'assetFile', maxCount: 1 },
    ]),
  )
  async create(
    @Request() req: any,
    @Body() createAssetDto: CreateAssetDto,
    @UploadedFiles() files: { thumbnail?: Express.Multer.File[]; assetFile?: Express.Multer.File[] },
  ) {
    if (!files.thumbnail || !files.thumbnail[0]) {
      throw new Error('Thumbnail is required');
    }

    return this.assetsService.create(
      req.user.id,
      createAssetDto,
      files.thumbnail[0],
      files.assetFile?.[0],
    );
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all assets with filters and pagination' })
  async findAll(@Query() filters: AssetFiltersDto) {
    return this.assetsService.findAll(filters);
  }

  @Public()
  @Get('featured')
  @ApiOperation({ summary: 'Get featured assets' })
  async findFeatured(@Query('limit') limit?: number) {
    return this.assetsService.findFeatured(limit);
  }

  @Public()
  @Get('trending')
  @ApiOperation({ summary: 'Get trending assets' })
  async findTrending(@Query('limit') limit?: number) {
    return this.assetsService.findTrending(limit);
  }

  @Get('my-top-assets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my top performing assets (for creators)' })
  async getMyTopAssets(
    @Request() req: any,
    @Query('limit') limit?: number,
  ) {
    return this.assetsService.getMyTopAssets(req.user.id, limit);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get asset by ID' })
  @ApiResponse({ status: 200, description: 'Asset found' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.id;
    return this.assetsService.findOne(id, userId);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update asset' })
  async update(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateAssetDto: UpdateAssetDto,
  ) {
    return this.assetsService.update(id, req.user.id, updateAssetDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete asset (soft delete)' })
  async remove(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.remove(id, req.user.id);
  }

  @Post(':id/like')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Like an asset' })
  async like(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.likeAsset(req.user.id, id);
  }

  @Delete(':id/unlike')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlike an asset' })
  async unlike(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.unlikeAsset(req.user.id, id);
  }

  @Post(':id/view')
  @Public()
  @ApiOperation({ summary: 'Increment view count' })
  async incrementView(@Param('id') id: string) {
    return this.assetsService.incrementView(id);
  }

  @Get(':id/download')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get download URL for asset' })
  @ApiResponse({ status: 200, description: 'Download URL generated' })
  @ApiResponse({ status: 403, description: 'Purchase required' })
  async getDownloadUrl(@Param('id') id: string, @Request() req: any) {
    return this.assetsService.getDownloadUrl(id, req.user.id);
  }
}
