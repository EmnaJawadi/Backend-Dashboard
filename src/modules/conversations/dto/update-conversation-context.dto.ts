import { IsOptional, IsString } from 'class-validator';

export class UpdateConversationContextDto {
  @IsOptional()
  @IsString()
  conversationSummary?: string | null;

  @IsOptional()
  @IsString()
  customerIntent?: string | null;

  @IsOptional()
  @IsString()
  requestedProductService?: string | null;

  @IsOptional()
  @IsString()
  requestedDeliveryDate?: string | null;

  @IsOptional()
  @IsString()
  deliveryAddress?: string | null;

  @IsOptional()
  @IsString()
  budget?: string | null;

  @IsOptional()
  @IsString()
  agreedTerms?: string | null;

  @IsOptional()
  @IsString()
  nextAction?: string | null;

  @IsOptional()
  @IsString()
  lastAiDecision?: string | null;

  @IsOptional()
  @IsString()
  importantNotes?: string | null;
}
