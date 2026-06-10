export class AiRunEntity {
  id!: string;
  conversationId!: string;
  messageId!: string;
  inputText!: string | null;
  inputType!: string | null;
  normalizedMessage!: string | null;
  detectedLanguage!: string | null;
  outputText!: string | null;
  intent!: string | null;
  provider!: string | null;
  model!: string | null;
  errorMessage!: string | null;
  fallbackUsed!: boolean | null;
  responseMode!: string | null;
  needsRag!: boolean | null;
  ragSources!: unknown;
  canAnswer!: boolean | null;
  orderIntent!: boolean | null;
  usedKb!: boolean | null;
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
