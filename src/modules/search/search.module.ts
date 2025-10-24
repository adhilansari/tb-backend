import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { PrismaModule } from '@/common/database/prisma.module';
import { StorageModule } from '@/common/storage/storage.module';
@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule { }
