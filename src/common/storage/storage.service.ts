import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Storage Service - Fixed for video streaming
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  // File type validation
  private readonly allowedImageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    'image/x-icon',
    'image/vnd.adobe.photoshop',
    'image/heic',
    'image/heif',
  ];

  private readonly allowedVideoTypes = [
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/x-matroska',
    'video/x-flv',
    'video/3gpp',
    'video/ogg',
  ];

  private readonly allowedAudioTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/x-m4a',
    'audio/mp4',
    'audio/flac',
  ];

  private readonly allowedDocumentTypes = [
    'application/pdf',
    'application/epub+zip',
    'application/x-mobipocket-ebook',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ];

  private readonly allowedArchiveTypes = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-rar',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-gzip',
  ];

  private readonly allowedTemplateTypes = [
    'application/json',
    'text/plain',
    'text/html',
    'text/css',
    'application/javascript',
    'text/javascript',
    'application/xml',
    'text/xml',
    'application/x-yaml',
    'text/yaml',
    'text/x-python',
    'text/x-java',
    'text/x-c',
    'text/x-c++',
    'text/x-php',
    'text/markdown',
    'application/typescript',
  ];

  private readonly allowedFontTypes = [
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    'application/font-woff',
    'application/x-font-ttf',
    'application/x-font-otf',
  ];

  private readonly allowed3DModelTypes = [
    'model/gltf+json',
    'model/gltf-binary',
    'application/octet-stream',
  ];

  private readonly allowedFileTypes = [
    ...this.allowedImageTypes,
    ...this.allowedVideoTypes,
    ...this.allowedAudioTypes,
    ...this.allowedDocumentTypes,
    ...this.allowedArchiveTypes,
    ...this.allowedTemplateTypes,
    ...this.allowedFontTypes,
    ...this.allowed3DModelTypes,
  ];

  // Size limits (in bytes)
  private readonly MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  private readonly MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

  constructor(private readonly configService: ConfigService) {
    const r2Config = this.configService.get('storage.r2');

    this.bucketName = r2Config?.bucketName || '';
    this.publicUrl = r2Config?.publicUrl || '';

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: r2Config?.endpoint,
      credentials: {
        accessKeyId: r2Config?.accessKeyId || '',
        secretAccessKey: r2Config?.secretAccessKey || '',
      },
    });

    this.logger.log('✅ Storage service initialized');
  }

  /**
   * Upload file to R2 with proper content type
   */
  async uploadFile(
    file: Express.Multer.File,
    folder = 'uploads'
  ): Promise<{ key: string; url: string }> {
    this.validateFile(file);

    const key = this.generateFileKey(file.originalname, folder);

    try {
      // Detect proper content type
      const contentType = this.getProperContentType(file);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: contentType,
        // Add cache control for videos
        CacheControl: this.isVideoFile(file.mimetype)
          ? 'public, max-age=31536000'
          : 'public, max-age=86400',
        Metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          originalMimeType: file.mimetype,
        },
      });

      await this.s3Client.send(command);

      const url = `${this.publicUrl}/${key}`;
      this.logger.log(`✅ File uploaded: ${key} (${contentType})`);

      return { key, url };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${JSON.stringify(error)}`);
      throw new Error(
        `File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get proper content type based on file extension and mime type
   */
  private getProperContentType(file: Express.Multer.File): string {
    const ext = file.originalname.split('.').pop()?.toLowerCase();

    // Video files - ensure proper content type
    if (this.isVideoFile(file.mimetype)) {
      const videoTypes: Record<string, string> = {
        mp4: 'video/mp4',
        m4v: 'video/mp4',
        mov: 'video/quicktime',
        avi: 'video/x-msvideo',
        webm: 'video/webm',
        mkv: 'video/x-matroska',
        flv: 'video/x-flv',
        '3gp': 'video/3gpp',
        ogv: 'video/ogg',
      };
      return videoTypes[ext || ''] || 'video/mp4';
    }

    // Audio files
    if (this.isAudioFile(file.mimetype)) {
      const audioTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        webm: 'audio/webm',
        aac: 'audio/aac',
        m4a: 'audio/mp4',
        flac: 'audio/flac',
      };
      return audioTypes[ext || ''] || 'audio/mpeg';
    }

    return file.mimetype;
  }

  /**
   * Generate presigned URL with proper headers for streaming
   */
  async getPresignedUrl(key: string, expiresIn = 3600, forStreaming = false): Promise<string> {
    try {
      // Detect file type from key
      const ext = key.split('.').pop()?.toLowerCase();
      const isVideo = ['mp4', 'm4v', 'mov', 'avi', 'webm', 'mkv'].includes(ext || '');
      const isAudio = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(ext || '');

      const commandParams: any = {
        Bucket: this.bucketName,
        Key: key,
      };

      // Add streaming-specific headers for video/audio
      if (forStreaming || isVideo || isAudio) {
        // Set proper content type
        if (isVideo) {
          commandParams.ResponseContentType = this.getContentTypeFromExtension(ext!);
        } else if (isAudio) {
          commandParams.ResponseContentType = `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
        }

        // Enable range requests for seeking
        commandParams.ResponseAcceptRanges = 'bytes';

        // Cache control
        commandParams.ResponseCacheControl = 'public, max-age=31536000';

        // Allow inline display
        commandParams.ResponseContentDisposition = 'inline';
      }

      const command = new GetObjectCommand(commandParams);

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(
        `✅ Generated presigned URL for ${key} (streaming: ${forStreaming || isVideo})`
      );
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${JSON.stringify(error)}`);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Get content type from file extension
   */
  private getContentTypeFromExtension(ext: string): string {
    const types: Record<string, string> = {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      flv: 'video/x-flv',
      '3gp': 'video/3gpp',
      ogv: 'video/ogg',
    };
    return types[ext] || 'video/mp4';
  }

  /**
   * Get streaming URL (alias for getPresignedUrl with streaming flag)
   */
  async getStreamingUrl(key: string, expiresIn = 3600): Promise<string> {
    return this.getPresignedUrl(key, expiresIn, true);
  }

  /**
   * Delete file from R2
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${JSON.stringify(error)}`);
      throw new Error(
        `File deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if mime type is video
   */
  private isVideoFile(mimeType: string): boolean {
    return this.allowedVideoTypes.includes(mimeType);
  }

  /**
   * Check if mime type is audio
   */
  private isAudioFile(mimeType: string): boolean {
    return this.allowedAudioTypes.includes(mimeType);
  }

  /**
   * Validate file type and size
   */
  private validateFile(file: Express.Multer.File): void {
    if (!this.allowedFileTypes.includes(file.mimetype)) {
      throw new Error(
        `Invalid file type: ${file.mimetype}. Please upload a supported file format.`
      );
    }

    let maxSize = this.MAX_FILE_SIZE;
    if (this.allowedImageTypes.includes(file.mimetype)) {
      maxSize = this.MAX_IMAGE_SIZE;
    } else if (this.allowedVideoTypes.includes(file.mimetype)) {
      maxSize = this.MAX_VIDEO_SIZE;
    } else if (this.allowedAudioTypes.includes(file.mimetype)) {
      maxSize = this.MAX_AUDIO_SIZE;
    }

    if (file.size > maxSize) {
      const maxSizeMB =
        maxSize >= 1024 * 1024 * 1024
          ? `${(maxSize / (1024 * 1024 * 1024)).toFixed(1)}GB`
          : `${(maxSize / (1024 * 1024)).toFixed(0)}MB`;
      const fileSizeMB =
        file.size >= 1024 * 1024 * 1024
          ? `${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB`
          : `${(file.size / (1024 * 1024)).toFixed(2)}MB`;

      throw new Error(`File too large. Maximum size: ${maxSizeMB}, got: ${fileSizeMB}`);
    }
  }

  /**
   * Generate unique file key
   */
  private generateFileKey(originalName: string, folder: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const extension = originalName.split('.').pop();
    const nameWithoutExt = originalName
      .split('.')
      .slice(0, -1)
      .join('.')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase();

    return `${folder}/${nameWithoutExt}-${timestamp}-${random}.${extension}`;
  }
}
