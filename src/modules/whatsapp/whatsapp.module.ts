import { Module } from '@nestjs/common';
import { ConversationWindowService } from './policies/conversation-window.service';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    ConversationWindowService,
    WhatsappComplianceService,
  ],
  exports: [
    WhatsappService,
    ConversationWindowService,
    WhatsappComplianceService,
  ],
})
export class WhatsappModule {}