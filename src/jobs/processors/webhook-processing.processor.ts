import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';
import { WebhooksService } from '../../modules/webhooks/webhooks.service';

@Injectable()
export class WebhookProcessingProcessor implements OnModuleInit {
  private readonly logger = new Logger(WebhookProcessingProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly webhooksService: WebhooksService,
  ) {}

  onModuleInit() {
    new Worker(
      'webhook-processing',
      async (job) => {
        this.logger.log(`Processing webhook job ${job.id}`);
        return this.webhooksService.receiveEvolutionWebhook(job.data);
      },
      {
        connection: this.redisService.getClient(),
      },
    );
  }
}