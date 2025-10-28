import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { SearchService } from './search.service';
import { AssetType, AssetCategory } from '@prisma/client';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) { }

  @Public()
  @Get('assets')
  @ApiOperation({ summary: 'Search assets' })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, enum: AssetType })
  @ApiQuery({ name: 'category', required: false, enum: AssetCategory })
  @ApiQuery({ name: 'isFree', required: false, type: Boolean })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  async searchAssets(
    @Query('query') query = '',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: AssetType,
    @Query('category') category?: AssetCategory,
    @Query('isFree') isFree?: boolean,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('sortBy') sortBy?: string
  ) {
    const filters = {
      type,
      category,
      isFree,
      minPrice,
      maxPrice,
      sortBy,
    };

    return this.searchService.searchAssets(query, filters, page, limit);
  }

  @Public()
  @Get('creators')
  @ApiOperation({ summary: 'Search creators' })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async searchCreators(
    @Query('query') query = '',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.searchService.searchCreators(query, page, limit);
  }
}
