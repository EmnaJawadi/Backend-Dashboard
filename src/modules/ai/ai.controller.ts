import { Body, Controller, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('reply')
  generateReply(@Body() payload: AiReplyRequestDto) {
    return this.aiService.generateReply(payload);
  }

  @Post('structured-output')
  generateStructuredOutput(@Body() body: { prompt: string }) {
    return this.aiService.generateStructuredOutput(body.prompt);
  }
}