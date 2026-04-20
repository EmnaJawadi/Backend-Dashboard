export class AiReplyResponseDto {
  intent = 'unknown';
  answer = '';
  reply = '';
  provider = '';
  model = '';
  safe = true;
  canSendFreeForm = false;
  templateRequired = false;
  handoffRequired = false;
  needsClarification = false;
  reason: string | null = null;
  sources: string[] = [];
  tagsToApply: string[] = [];
  shouldEscalate = false;
  escalationReason: string | null = null;
  confidence = 0;
  summary: string | null = null;
  blockedReason: string | null = null;
  aiRunId: string | null = null;
  action: string | null = null;
  metadata?: Record<string, unknown>;

  constructor(partial?: Partial<AiReplyResponseDto>) {
    Object.assign(this, partial);
  }
}
