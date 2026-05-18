export class AiReplyResponseDto {
  shouldSendMessage = false;
  intent = 'unknown';
  answer = '';
  reply = '';
  replyText: string | null = null;
  canAnswer = false;
  provider = '';
  model = '';
  safe = true;
  canSendFreeForm = false;
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
  missingFields: string[] = [];
  aiRunId: string | null = null;
  action: string | null = null;
  messageType = 'unknown';
  debug: {
    usedRag: boolean;
    usedVision: boolean;
    usedAudioTranscription: boolean;
    usedConversationContext: boolean;
    companyId: string | null;
    conversationId: string | null;
  } = {
    usedRag: false,
    usedVision: false,
    usedAudioTranscription: false,
    usedConversationContext: false,
    companyId: null,
    conversationId: null,
  };
  metadata?: Record<string, unknown>;

  constructor(partial?: Partial<AiReplyResponseDto>) {
    Object.assign(this, partial);
  }
}
