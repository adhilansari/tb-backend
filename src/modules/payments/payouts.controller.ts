// File: src/modules/payments/payouts.controller.ts
import { Controller, Get, Param, Query, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';

@ApiTags('Payouts')
@Controller('payouts')
@ApiBearerAuth()
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('earnings')
  @ApiOperation({ summary: 'Get creator earnings summary' })
  async getEarnings(@Request() req: any) {
    return this.payoutsService.getCreatorEarnings(req.user.id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get payout history for creator' })
  async getPayoutHistory(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number
  ) {
    return this.payoutsService.getPayoutHistory(
      req.user.id,
      page ? parseInt(page.toString()) : 1,
      limit ? parseInt(limit.toString()) : 20
    );
  }

  @Get('pending-escrow')
  @ApiOperation({ summary: 'Get transactions pending payout (in escrow)' })
  async getPendingEscrow(@Request() req: any) {
    return this.payoutsService.getPendingEscrowTransactions(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payout details by ID' })
  async getPayoutById(@Request() req: any, @Param('id') id: string) {
    return this.payoutsService.getPayoutById(id, req.user.id);
  }
}
