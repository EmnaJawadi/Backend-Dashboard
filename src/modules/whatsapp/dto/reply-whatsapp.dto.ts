import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class WhatsappReplyTemplateDto {
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parameters?: string[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}

export class ReplyWhatsappDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsISO8601()
  lastCustomerMessageAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsappReplyTemplateDto)
  template?: WhatsappReplyTemplateDto;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parameters?: string[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  automated?: boolean;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsOptional()
  @IsIn(['bot', 'agent', 'system'])
  senderType?: 'bot' | 'agent' | 'system';
}
