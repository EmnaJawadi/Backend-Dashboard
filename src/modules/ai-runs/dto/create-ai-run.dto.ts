import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
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
  prompt?: string;

  @IsOptional()
  @IsString()
  response?: string;

  @IsOptional()
  @IsString()
  provider?: string = 'gemini';

  @IsOptional()
  @IsString()
  model?: string = 'gemini-1.5-flash';

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
  @IsObject()
  metadata?: Record<string, unknown>;
}