import { Module } from '@nestjs/common';
import { EvolutionApiClient } from '../../integrations/whatsapp/evolution-api.client';
import { WhatsappProviderService } from '../../integrations/whatsapp/whatsapp-provider.interface';
import { ConversationWindowService } from './policies/conversation-window.service';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [WhatsappController],
  providers: [
    EvolutionApiClient,
    WhatsappProviderService,
    WhatsappService,
    ConversationWindowService,
    WhatsappComplianceService,
  ],
  exports: [
    EvolutionApiClient,
    WhatsappProviderService,
    WhatsappService,
    ConversationWindowService,
    WhatsappComplianceService,
  ],
})
export class WhatsappModule {}
