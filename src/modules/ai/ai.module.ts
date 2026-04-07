import { Module } from '@nestjs/common';
import { GeminiModule } from '../../integrations/gemini/gemini.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiSafetyRulesService } from './policies/ai-safety-rules.service';
import { EscalationDecisionService } from './policies/escalation-decision.service';
import { HallucinationGuardService } from './policies/hallucination-guard.service';

@Module({
  imports: [GeminiModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiSafetyRulesService,
    EscalationDecisionService,
    HallucinationGuardService,
  ],
  exports: [AiService],
})
export class AiModule {}