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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('create-order')
  @ApiOperation({ summary: 'Create Razorpay order for asset purchase' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or already purchased' })
  async createOrder(@Request() req: any, @Body() createOrderDto: CreateOrderDto) {
    return this.transactionsService.createOrder(req.user.id, createOrderDto);
  }

  @Post('verify-payment')
  @ApiOperation({ summary: 'Verify Razorpay payment signature' })
  @ApiResponse({ status: 200, description: 'Payment verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid signature' })
  async verifyPayment(@Request() req: any, @Body() verifyPaymentDto: VerifyPaymentDto) {
    return this.transactionsService.verifyPayment(req.user.id, verifyPaymentDto);
  }

  @Get('my-purchases')
  @ApiOperation({ summary: 'Get my purchase history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyPurchases(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.transactionsService.getMyPurchases(req.user.id, page, limit);
  }

  @Get('my-sales')
  @ApiOperation({ summary: 'Get my sales history (for creators)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMySales(
    @Request() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.transactionsService.getMySales(req.user.id, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiResponse({ status: 200, description: 'Transaction found' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.transactionsService.findOne(id, req.user.id);
  }
}
