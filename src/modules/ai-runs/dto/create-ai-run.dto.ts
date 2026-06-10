import {
  IsIn,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsArray,
  IsString,
  Min,
} from 'class-validator';

export class CreateAiRunDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  inputType?: string;

  @IsOptional()
  @IsString()
  normalizedMessage?: string;

  @IsOptional()
  @IsString()
  detectedLanguage?: string;

  @IsOptional()
  @IsString()
  response?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsBoolean()
  fallbackUsed?: boolean;

  @IsOptional()
  @IsString()
  responseMode?: string;

  @IsOptional()
  @IsBoolean()
  needsRag?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ragSources?: string[];

  @IsOptional()
  @IsBoolean()
  canAnswer?: boolean;

  @IsOptional()
  @IsBoolean()
  orderIntent?: boolean;

  @IsOptional()
  @IsBoolean()
  usedKb?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceArticleIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceChunkIds?: string[];

  @IsOptional()
  @IsArray()
  retrievedChunksPreview?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsIn(['success', 'failed', 'blocked', 'pending'])
  status?: 'success' | 'failed' | 'blocked' | 'pending' = 'success';

  @IsOptional()
  @IsNumber()
  @Min(0)
  latencyMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promptTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  completionTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tokensUsed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  confidenceScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsString()
  blockedReason?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  matchedProductId?: string | null;

  @IsOptional()
  @IsObject()
  imageAnalysisResult?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  shouldSendMessage?: boolean;

  @IsOptional()
  @IsBoolean()
  handoffRequired?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagsToApply?: string[];

  @IsOptional()
  @IsObject()
  rawResponse?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
