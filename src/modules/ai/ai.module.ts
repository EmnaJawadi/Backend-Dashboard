import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AiRunsModule } from '../ai-runs/ai-runs.module';
import { RagModule } from '../rag/rag.module';
import { AiController } from './ai.controller';
import { AiWorkflowController } from './ai-workflow.controller';
import { AiProviderService } from './providers/ai-provider.service';
import { WorkflowAiService } from './workflow-ai.service';
import { ProductsModule } from '../products/products.module';
import { CompanyAiPolicyService } from './company-ai-policy.service';

@Module({
  imports: [
    PrismaModule,
    RagModule,
    AiRunsModule,
    ProductsModule,
  ],
  controllers: [AiController, AiWorkflowController],
  providers: [AiProviderService, CompanyAiPolicyService, WorkflowAiService],
  exports: [AiProviderService, WorkflowAiService],
})
export class AiModule {}
