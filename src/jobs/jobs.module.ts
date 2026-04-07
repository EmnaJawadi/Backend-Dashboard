import { Module } from '@nestjs/common';
import { RedisModule } from '../integrations/redis/redis.module';

import { AiReplyProcessor } from './processors/ai-reply.processor';
import { DeadLetterProcessor } from './processors/dead-letter.processor';
import { KbIngestionProcessor } from './processors/kb-ingestion.processor';
import { WebhookProcessingProcessor } from './processors/webhook-processing.processor';

import { AiReplyQueue } from './queues/ai-reply.queue';
import { DeadLetterQueue } from './queues/dead-letter.queue';
import { KbIngestionQueue } from './queues/kb-ingestion.queue';
import { WebhookProcessingQueue } from './queues/webhook-processing.queue';

import { ConversationCleanupScheduler } from './schedulers/conversation-cleanup.scheduler';
import { MetricsAggregationScheduler } from './schedulers/metrics-aggregation.scheduler';

import { AiModule } from '../modules/ai/ai.module';
import { WebhooksModule } from '../modules/webhooks/webhooks.module';

@Module({
  imports: [RedisModule, AiModule, WebhooksModule],
  providers: [
    // processors
    AiReplyProcessor,
    DeadLetterProcessor,
    KbIngestionProcessor,
    WebhookProcessingProcessor,

    // queues
    AiReplyQueue,
    DeadLetterQueue,
    KbIngestionQueue,
    WebhookProcessingQueue,

    // schedulers
    ConversationCleanupScheduler,
    MetricsAggregationScheduler,
  ],
  exports: [
    AiReplyQueue,
    WebhookProcessingQueue,
  ],
})
export class JobsModule {}