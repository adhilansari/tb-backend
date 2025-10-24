import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { PrismaModule } from '@/common/database/prisma.module';
import { StorageModule } from '@/common/storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule { }
