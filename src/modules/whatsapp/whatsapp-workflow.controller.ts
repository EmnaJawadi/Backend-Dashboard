import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { WhatsappService } from './whatsapp.service';

type WorkflowSendMessageBody = {
  conversationId?: string | null;
  phoneNumber?: string;
  message?: unknown;
  text?: unknown;
  replyText?: unknown;
  instance?: string;
  instanceName?: string;
  senderType?: 'human' | 'human_agent' | 'agent' | 'bot' | 'system';
};

@Controller(['whatsapp/workflow', 'api/whatsapp/workflow'])
@UseGuards(ApiKeyGuard)
export class WhatsappWorkflowController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send-message')
  sendMessage(@Body() body: WorkflowSendMessageBody) {
    return this.whatsappService.sendWorkflowMessage({
      conversationId: body.conversationId,
      phoneNumber: body.phoneNumber,
      message: this.resolveWorkflowMessage(body),
      instanceName: body.instanceName ?? body.instance,
      senderType: body.senderType ?? 'bot',
    });
  }

  private resolveWorkflowMessage(body: WorkflowSendMessageBody): string {
    for (const value of [body.message, body.text, body.replyText]) {
      const message = this.extractReplyText(value);

      if (message) {
        return message;
      }
    }

    return '';
  }

  private extractReplyText(value: unknown): string {
    if (typeof value === 'string') {
      const parsed = this.tryParseJson(value);

      if (parsed && parsed !== value) {
        return this.extractReplyText(parsed);
      }

      const trimmed = value.trim();

      return this.isJsonLike(trimmed) ? '' : trimmed;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return '';
    }

    const data = value as Record<string, unknown>;

    for (const key of ['reply', 'answer', 'replyText']) {
      const text = data[key];

      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }

    const nestedAiReply = data.aiReply;
    if (nestedAiReply && typeof nestedAiReply === 'object') {
      return this.extractReplyText(nestedAiReply);
    }

    return '';
  }

  private tryParseJson(value: string): unknown {
    const trimmed = value.trim();

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return value;
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      const answerMatch = trimmed.match(
        /"(?:reply|answer|replyText)"\s*:\s*"((?:\\.|[^"\\])*)"/s,
      );
      const encodedAnswer = answerMatch?.[1];

      if (!encodedAnswer) {
        return value;
      }

      try {
        return { answer: JSON.parse(`"${encodedAnswer}"`) as string };
      } catch {
        return {
          answer: encodedAnswer
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .trim(),
        };
      }
    }
  }

  private isJsonLike(value: string): boolean {
    return value.startsWith('{') || value.startsWith('[');
  }
}
