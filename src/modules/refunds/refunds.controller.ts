import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RefundsService } from './refunds.service';
import { RequestRefundDto } from './dto/request-refund.dto';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';

@ApiTags('Refunds')
@ApiBearerAuth()
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post('request')
  @ApiOperation({ summary: 'Request a refund for a transaction' })
  @ApiResponse({ status: 201, description: 'Refund request created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or refund not eligible' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async requestRefund(@Request() req: any, @Body() dto: RequestRefundDto) {
    return this.refundsService.requestRefund(req.user.id, dto);
  }

  @Post('process/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Process a refund (Admin only)' })
  @ApiResponse({ status: 200, description: 'Refund processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Refund not found' })
  async processRefund(@Param('id') id: string) {
    return this.refundsService.processRefund(id);
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all refund requests (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllRefunds(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number
  ) {
    return this.refundsService.getAllRefunds(page, limit);
  }

  @Get('my-refunds')
  @ApiOperation({ summary: 'Get my refund requests' })
  async getMyRefunds(@Request() req: any) {
    return this.refundsService.getMyRefunds(req.user.id);
  }
}
