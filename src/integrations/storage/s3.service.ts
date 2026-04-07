import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? '';
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET') ?? '';

    this.client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  async uploadFile(params: {
    key: string;
    body: Buffer | Uint8Array | string;
    contentType?: string;
  }): Promise<{ key: string; url: string | null }> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
        }),
      );

      const url = await this.getSignedFileUrl(params.key, 3600).catch(() => null);

      return {
        key: params.key,
        url,
      };
    } catch (error) {
      this.logger.error(`S3 upload failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.error(`S3 delete failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }

  async getSignedFileUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      this.logger.error(`S3 signed URL generation failed: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to generate S3 signed URL');
    }
  }
}