import { IsArray, IsOptional, IsString } from 'class-validator';

export class LearnFromHumanResponseDto {
  @IsString()
  companyId!: string;

  @IsString()
  conversationId!: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  customerMessageId?: string;

  @IsOptional()
  @IsString()
  humanAnswerMessageId?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;

  @IsString()
  customerQuestion!: string;

  @IsString()
  humanAnswer!: string;

  @IsOptional()
  @IsString()
  suggestedCategory?: string;

  @IsOptional()
  @IsArray()
  suggestedTags?: string[];

  @IsOptional()
  @IsString()
  language?: string;
}
