export class AiReplyResponseDto {
  shouldSendMessage = false;
  normalizedMessage = '';
  detectedLanguage = 'unknown';
  intent = 'unknown';
  needsRag = false;
  orderIntent = false;
  orderDetails: {
    actionType: string | null;
    customerName: string | null;
    requestedItem: string | null;
    quantity: string | null;
    requestedDate: string | null;
    address: string | null;
    phone: string | null;
    notes: string | null;
    items: Array<{
      name: string;
      quantity: number | null;
      unitPrice: number | null;
      currency: string | null;
      subtotal: number | null;
      availability: string | null;
    }>;
    total: number | null;
    currency: string | null;
    availability: string | null;
    confirmationStatus: string | null;
    missingFields: string[];
  } = {
    actionType: null,
    customerName: null,
    requestedItem: null,
    quantity: null,
    requestedDate: null,
    address: null,
    phone: null,
    notes: null,
    items: [],
    total: null,
    currency: null,
    availability: null,
    confirmationStatus: null,
    missingFields: [],
  };
  replyDraft = '';
  keywordsForSearch: string[] = [];
  importance: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL';
  source: 'KB' | 'LLM' | 'GEMINI' | 'FALLBACK' = 'FALLBACK';
  answer = '';
  reply = '';
  replyText: string | null = null;
  canAnswer = false;
  provider = '';
  model = '';
  fallbackUsed = false;
  errorMessage: string | null = null;
  responseMode:
    | 'KB_WITH_LLM'
    | 'LLM_ONLY'
    | 'KB_WITH_GEMINI'
    | 'GEMINI_ONLY'
    | 'HANDOFF_REQUIRED'
    | 'KB_DIRECT_DEBUG' = 'HANDOFF_REQUIRED';
  usedKb = false;
  sourceChunkIds: string[] = [];
  sourceArticleIds: string[] = [];
  retrievedChunksPreview: Array<{
    chunkId: string;
    articleId: string | null;
    score: number;
    preview: string;
  }> = [];
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
