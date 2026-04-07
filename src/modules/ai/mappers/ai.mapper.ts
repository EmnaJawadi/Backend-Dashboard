import { AiReplyResponseDto } from '../dto/ai-reply-response.dto';

type BuildAiReplyResponseParams = {
  reply: string;
  provider: string;
  model: string;
  safe: boolean;
  shouldEscalate: boolean;
  escalationReason: string | null;
  confidence: number;
  summary: string | null;
  blockedReason: string | null;
  metadata?: Record<string, unknown>;
};

export class AiMapper {
  static toReplyResponse(params: BuildAiReplyResponseParams): AiReplyResponseDto {
    return new AiReplyResponseDto({
      reply: params.reply,
      provider: params.provider,
      model: params.model,
      safe: params.safe,
      shouldEscalate: params.shouldEscalate,
      escalationReason: params.escalationReason,
      confidence: params.confidence,
      summary: params.summary,
      blockedReason: params.blockedReason,
      metadata: params.metadata,
    });
  }
}