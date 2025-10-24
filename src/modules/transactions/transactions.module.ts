import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { RazorpayService } from './razorpay.service';
import { PrismaModule } from '@/common/database/prisma.module';
import razorpayConfig from '@/config/razorpay.config';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule, ConfigModule.forFeature(razorpayConfig)],
  controllers: [TransactionsController],
  providers: [TransactionsService, RazorpayService],
  exports: [TransactionsService],
})
export class TransactionsModule { }
