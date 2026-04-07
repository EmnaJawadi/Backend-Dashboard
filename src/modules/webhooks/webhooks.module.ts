import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksRepository } from './webhooks.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { InboundMessagesHandler } from './handlers/inbound-message.handler';
import { DeliveryStatusHandler } from './handlers/delivery-status.handler';
import { ConversationEventsHandler } from './handlers/conversation-event.handler';

@Module({
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhooksRepository,
    PrismaService,
    InboundMessagesHandler,
    DeliveryStatusHandler,
    ConversationEventsHandler,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}