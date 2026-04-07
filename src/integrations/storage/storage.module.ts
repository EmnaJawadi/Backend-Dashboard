import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Service } from './s3.service';
import { MinioService } from './minio.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [S3Service, MinioService],
  exports: [S3Service, MinioService],
})
export class StorageModule {}