import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class SendTemplateMessageDto {
  @IsString()
  phoneNumber!: string;

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
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  senderId?: string;
}
