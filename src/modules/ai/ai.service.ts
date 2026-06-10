import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AiRunsRepository } from '../ai-runs/ai-runs.repository';
import { RagService } from '../rag/rag.service';
import { AiProviderService } from './providers/ai-provider.service';
import { WorkflowAiService } from './workflow-ai.service';

/**
 * Backward-compatible import for code and tests that referenced AiService.
 * Runtime controllers use WorkflowAiService directly.
 */
@Injectable()
export class AiService extends WorkflowAiService {
  constructor(
    prisma: PrismaService,
    aiProviderService: AiProviderService,
    ragService: RagService,
    aiRunsRepository: AiRunsRepository,
    ..._legacyDependencies: unknown[]
  ) {
    super(prisma, aiProviderService, ragService, aiRunsRepository);
  }
}
