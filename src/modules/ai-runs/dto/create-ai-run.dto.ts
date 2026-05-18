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
  response?: string;

  @IsOptional()
  @IsString()
  intent?: string;

  @IsOptional()
  @IsString()
  provider?: string = 'gemini';

  @IsOptional()
  @IsString()
  model?: string = 'gemini-2.5-flash';

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
  metadata?: Record<string, unknown>;
}
