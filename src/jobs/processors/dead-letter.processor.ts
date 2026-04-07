import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';

@Injectable()
export class DeadLetterProcessor implements OnModuleInit {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  constructor(private readonly redisService: RedisService) {}

  onModuleInit() {
    new Worker(
      'dead-letter',
      async (job) => {
        this.logger.error(`Dead job received: ${job.id}`);
        this.logger.error(JSON.stringify(job.data));
      },
      {
        connection: this.redisService.getClient(),
      },
    );
  }
}