import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@/common/database/prisma.module';
import { RazorpayService } from './razorpay.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [PaymentsController, PayoutsController],
  providers: [RazorpayService, PaymentsService, PayoutsService],
  exports: [RazorpayService, PaymentsService, PayoutsService],
})
export class PaymentsModule {}
