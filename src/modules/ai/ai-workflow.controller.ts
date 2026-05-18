import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { AiService } from './ai.service';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';

@Controller(['ai/workflow', 'api/ai/workflow'])
@UseGuards(ApiKeyGuard)
export class AiWorkflowController {
  constructor(private readonly aiService: AiService) {}

  @Post('reply')
  generateWorkflowReply(@Body() payload: AiReplyRequestDto) {
    return this.aiService.generateReply(payload, undefined, {
      enforceWorkflowPayload: true,
    });
  }
}
