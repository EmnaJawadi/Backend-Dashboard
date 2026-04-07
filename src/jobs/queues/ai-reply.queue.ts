import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';

@Injectable()
export class AiReplyQueue {
  private readonly queue: Queue;

  constructor(redisService: RedisService) {
    this.queue = new Queue('ai-reply', {
      connection: redisService.getClient(),
    });
  }

  async addJob(data: unknown) {
    return this.queue.add('generate-reply', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
}