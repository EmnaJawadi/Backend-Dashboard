import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';
import { WorkflowAiService } from './workflow-ai.service';

@Controller(['ai/workflow', 'api/ai/workflow'])
@UseGuards(ApiKeyGuard)
export class AiWorkflowController {
  constructor(private readonly aiService: WorkflowAiService) {}

  @Post('reply')
  generateWorkflowReply(@Body() payload: AiReplyRequestDto) {
    return this.aiService.generateReply(payload, undefined, {
      enforceWorkflowPayload: true,
    });
  }
}
