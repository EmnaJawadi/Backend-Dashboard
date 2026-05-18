import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { EvolutionApiClient } from '../../integrations/whatsapp/evolution-api.client';
import { WhatsappProviderService } from '../../integrations/whatsapp/whatsapp-provider.interface';
import { ConversationWindowService } from './policies/conversation-window.service';
import { WhatsappComplianceService } from './policies/whatsapp-compliance.service';
import { CompanyWhatsappController } from './company-whatsapp.controller';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappWorkflowController } from './whatsapp-workflow.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    WhatsappController,
    WhatsappWorkflowController,
    CompanyWhatsappController,
  ],
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
