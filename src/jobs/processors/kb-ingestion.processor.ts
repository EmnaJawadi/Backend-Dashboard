import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';

@Injectable()
export class KbIngestionProcessor implements OnModuleInit {
  private readonly logger = new Logger(KbIngestionProcessor.name);

  constructor(private readonly redisService: RedisService) {}

  onModuleInit() {
    new Worker(
      'kb-ingestion',
      async (job) => {
        this.logger.log(`Processing KB ingestion ${job.id}`);
        // TODO: process documents, embeddings...
        return { success: true };
      },
      {
        connection: this.redisService.getClient(),
      },
    );
  }
}