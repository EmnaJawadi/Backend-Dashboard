import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';

@Injectable()
export class DeadLetterQueue {
  private readonly queue: Queue;

  constructor(redisService: RedisService) {
    this.queue = new Queue('dead-letter', {
      connection: redisService.getClient(),
    });
  }

  async addJob(data: unknown) {
    return this.queue.add('dead', data);
  }
}