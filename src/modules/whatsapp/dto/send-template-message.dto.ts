import { IsObject, IsOptional, IsString } from 'class-validator';

export class SendTemplateMessageDto {
  @IsString()
  phoneNumber!: string;

  @IsString()
  templateName!: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
