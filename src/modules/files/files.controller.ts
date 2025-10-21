import { Controller, Get, Param, Res, HttpStatus, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { StorageService } from '@/common/storage/storage.service';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(private readonly storageService: StorageService) { }

  @Public()
  @Get(':folder/:filename')
  @ApiOperation({ summary: 'Get uploaded file' })
  @ApiParam({ name: 'folder', description: 'File folder (avatars, assets, etc.)' })
  @ApiParam({ name: 'filename', description: 'Filename' })
  @ApiResponse({ status: 200, description: 'File retrieved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  async getFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    try {
      const key = `${folder}/${filename}`;

      // Check if file exists
      const exists = await this.storageService.fileExists(key);
      if (!exists) {
        throw new NotFoundException('File not found');
      }

      // Get presigned URL and redirect
      const url = await this.storageService.getPresignedUrl(key, 3600); // 1 hour expiry

      // Add cache-control headers to prevent browser caching of redirects
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      return res.redirect(HttpStatus.TEMPORARY_REDIRECT, url);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new NotFoundException('File not found');
    }
  }
}
