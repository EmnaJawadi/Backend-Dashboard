export class AiRunEntity {
  id = '';
  conversationId: string | null = null;
  contactId: string | null = null;
  prompt: string | null = null;
  response: string | null = null;
  provider = '';
  model = '';
  status = '';
  latencyMs: number | null = null;
  tokensUsed: number | null = null;
  confidenceScore: number | null = null;
  estimatedCost: number | null = null;
  blockedReason: string | null = null;
  metadata: Record<string, unknown> | null = null;
  createdAt = new Date();
  updatedAt = new Date();

  constructor(partial?: Partial<AiRunEntity>) {
    Object.assign(this, partial);
  }
}