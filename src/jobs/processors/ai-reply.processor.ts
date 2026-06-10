import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { RedisService } from '../../integrations/redis/redis.service';
import { WorkflowAiService } from '../../modules/ai/workflow-ai.service';

@Injectable()
export class AiReplyProcessor implements OnModuleInit {
  private readonly logger = new Logger(AiReplyProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly aiService: WorkflowAiService,
  ) {}

  onModuleInit() {
    new Worker(
      'ai-reply',
      async (job) => {
        this.logger.log(`Processing AI reply job ${job.id}`);

        const result = await this.aiService.generateReply(job.data);

        return result;
      },
      {
        connection: this.redisService.getClient(),
      },
    );
  }
}
