import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksRepository } from './webhooks.repository';
import { InboundMessagesHandler } from './handlers/inbound-message.handler';
import { DeliveryStatusHandler } from './handlers/delivery-status.handler';
import { ConversationEventsHandler } from './handlers/conversation-event.handler';

@Module({
  imports: [PrismaModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    WebhooksRepository,
    InboundMessagesHandler,
    DeliveryStatusHandler,
    ConversationEventsHandler,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
