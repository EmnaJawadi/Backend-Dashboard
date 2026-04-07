export class AiReplyResponseDto {
  reply = '';
  provider = '';
  model = '';
  safe = true;
  shouldEscalate = false;
  escalationReason: string | null = null;
  confidence = 0;
  summary: string | null = null;
  blockedReason: string | null = null;
  metadata?: Record<string, unknown>;

  constructor(partial?: Partial<AiReplyResponseDto>) {
    Object.assign(this, partial);
  }
}