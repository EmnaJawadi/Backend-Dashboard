import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';

@Injectable()
export class KbIngestionQueue {
  private readonly queue: Queue;

  constructor(redisService: RedisService) {
    this.queue = new Queue('kb-ingestion', {
      connection: redisService.getClient(),
    });
  }

  async addJob(data: unknown) {
    return this.queue.add('ingest', data);
  }
}