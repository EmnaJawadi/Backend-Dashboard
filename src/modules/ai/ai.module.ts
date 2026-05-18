import { Module } from '@nestjs/common';
import { GeminiModule } from '../../integrations/gemini/gemini.module';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AiRunsModule } from '../ai-runs/ai-runs.module';
import { RagModule } from '../rag/rag.module';
import { ProductsModule } from '../products/products.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AiController } from './ai.controller';
import { AiWorkflowController } from './ai-workflow.controller';
import { AiService } from './ai.service';
import { CustomerReplyFormatterService } from './formatters/customer-reply-formatter.service';
import { AiSafetyRulesService } from './policies/ai-safety-rules.service';
import { CustomerIntentService } from './policies/customer-intent.service';
import { EscalationDecisionService } from './policies/escalation-decision.service';
import { HallucinationGuardService } from './policies/hallucination-guard.service';

@Module({
  imports: [
    GeminiModule,
    PrismaModule,
    RagModule,
    AiRunsModule,
    WhatsappModule,
    ProductsModule,
  ],
  controllers: [AiController, AiWorkflowController],
  providers: [
    AiService,
    CustomerReplyFormatterService,
    AiSafetyRulesService,
    CustomerIntentService,
    EscalationDecisionService,
    HallucinationGuardService,
  ],
  exports: [AiService],
})
export class AiModule {}
