import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';

@Injectable()
export class WebhookProcessingQueue {
  private readonly queue: Queue;

  constructor(redisService: RedisService) {
    this.queue = new Queue('webhook-processing', {
      connection: redisService.getClient(),
    });
  }

  async addJob(data: unknown) {
    return this.queue.add('process-webhook', data);
  }
}