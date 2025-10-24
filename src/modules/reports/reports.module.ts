import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaModule } from '@/common/database/prisma.module';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule { }
