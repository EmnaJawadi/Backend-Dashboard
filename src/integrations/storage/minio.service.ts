import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const endPoint = this.configService.get<string>('MINIO_ENDPOINT') ?? '127.0.0.1';
    const port = Number(this.configService.get<string>('MINIO_PORT') ?? 9000);
    const useSSL = (this.configService.get<string>('MINIO_USE_SSL') ?? 'false') === 'true';
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY') ?? '';
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY') ?? '';
    this.bucket = this.configService.get<string>('MINIO_BUCKET') ?? 'uploads';

    this.client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  }

  async ensureBucketExists(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);

      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`MinIO bucket "${this.bucket}" created`);
      }
    } catch (error) {
      this.logger.error(`MinIO bucket check/create failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to initialize MinIO bucket');
    }
  }

  async uploadFile(params: {
    key: string;
    body: Buffer;
    contentType?: string;
  }): Promise<{ key: string; url: string | null }> {
    try {
      await this.ensureBucketExists();

      await this.client.putObject(this.bucket, params.key, params.body, undefined, {
        'Content-Type': params.contentType ?? 'application/octet-stream',
      });

      const url = await this.getPresignedUrl(params.key, 3600).catch(() => null);

      return {
        key: params.key,
        url,
      };
    } catch (error) {
      this.logger.error(`MinIO upload failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to upload file to MinIO');
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (error) {
      this.logger.error(`MinIO delete failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to delete file from MinIO');
    }
  }

  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.bucket, key, expirySeconds);
    } catch (error) {
      this.logger.error(`MinIO presigned URL failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to generate MinIO signed URL');
    }
  }
}