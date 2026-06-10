import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class WorkflowOrderIntentDto {
  @IsString()
  conversationId!: string;

  @IsString()
  companyId!: string;

  @IsString()
  contactId!: string;

  @IsBoolean()
  orderIntent!: boolean;

  @IsString()
  intent!: string;

  @IsString()
  normalizedMessage!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywordsForSearch?: string[];

  @IsOptional()
  @IsString()
  detectedLanguage?: string;

  @IsOptional()
  @IsObject()
  orderDetails?: {
    actionType?: string | null;
    customerName?: string | null;
    requestedItem?: string | null;
    quantity?: string | null;
    requestedDate?: string | null;
    address?: string | null;
    phone?: string | null;
    notes?: string | null;
    items?: Array<{
      name?: string;
      quantity?: number | null;
      unitPrice?: number | null;
      currency?: string | null;
      subtotal?: number | null;
      availability?: string | null;
    }>;
    total?: number | null;
    currency?: string | null;
    availability?: string | null;
    confirmationStatus?: string | null;
    missingFields?: string[];
  };
}
