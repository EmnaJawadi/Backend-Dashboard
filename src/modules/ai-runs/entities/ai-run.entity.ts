export class AiRunEntity {
  id!: string;
  conversationId!: string;
  messageId!: string;
  inputText!: string | null;
  outputText!: string | null;
  intent!: string | null;
  provider!: string | null;
  model!: string | null;
  status!: string | null;
  confidenceScore!: number | null;
  latencyMs!: number | null;
  tokensUsed!: number | null;
  estimatedCost!: number | null;
  handoffRequired!: boolean | null;
  rawResponse!: unknown;
  createdAt!: Date;

  constructor(partial?: Partial<AiRunEntity>) {
    Object.assign(this, partial);
  }
}