import {
  Controller,
  Get,
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
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get creator dashboard overview' })
  @ApiResponse({ status: 200, description: 'Overview data retrieved successfully' })
  async getOverview(@Request() req: any) {
    return this.reportsService.getOverview(req.user.id);
  }

  @Get('monthly-revenue')
  @ApiOperation({ summary: 'Get monthly revenue data' })
  @ApiQuery({ name: 'months', required: false, type: Number, description: 'Number of months (default: 12)' })
  async getMonthlyRevenue(
    @Request() req: any,
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
  ) {
    return this.reportsService.getMonthlyRevenue(req.user.id, months);
  }
}
