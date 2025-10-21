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
 * Storage Service - Handles file uploads to Cloudflare R2
 * Uses S3-compatible API
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
    'application/octet-stream', // for .glb, .fbx, .obj
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
   * Upload file to R2
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
  ): Promise<{ key: string; url: string }> {
    this.validateFile(file);

    const key = this.generateFileKey(file.originalname, folder);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.s3Client.send(command);

      const url = `${this.publicUrl}/${key}`;
      this.logger.log(`File uploaded successfully: ${key}`);

      return { key, url };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error}`);
      throw new Error(`File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate presigned URL for temporary access
   */
  async getPresignedUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error}`);
      throw new Error('Failed to generate download URL');
    }
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
      this.logger.error(`Failed to delete file: ${error}`);
      throw new Error(`File deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate file type and size
   */
  private validateFile(file: Express.Multer.File): void {
    // Check file type
    if (!this.allowedFileTypes.includes(file.mimetype)) {
      throw new Error(
        `Invalid file type: ${file.mimetype}. Please upload a supported file format.`,
      );
    }

    // Determine max size based on file type
    let maxSize = this.MAX_FILE_SIZE;
    if (this.allowedImageTypes.includes(file.mimetype)) {
      maxSize = this.MAX_IMAGE_SIZE;
    } else if (this.allowedVideoTypes.includes(file.mimetype)) {
      maxSize = this.MAX_VIDEO_SIZE;
    } else if (this.allowedAudioTypes.includes(file.mimetype)) {
      maxSize = this.MAX_AUDIO_SIZE;
    }

    // Check file size
    if (file.size > maxSize) {
      const maxSizeMB = maxSize >= 1024 * 1024 * 1024
        ? `${(maxSize / (1024 * 1024 * 1024)).toFixed(1)}GB`
        : `${(maxSize / (1024 * 1024)).toFixed(0)}MB`;
      const fileSizeMB = file.size >= 1024 * 1024 * 1024
        ? `${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB`
        : `${(file.size / (1024 * 1024)).toFixed(2)}MB`;

      throw new Error(
        `File too large. Maximum size: ${maxSizeMB}, got: ${fileSizeMB}`,
      );
    }
  }

  /**
   * Generate unique file key with timestamp and random string
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
