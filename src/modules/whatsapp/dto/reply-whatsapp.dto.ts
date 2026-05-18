import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class ReplyWhatsappDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsBoolean()
  automated?: boolean;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsOptional()
  @IsString()
  instanceName?: string;

  @IsOptional()
  @IsIn(['bot', 'human', 'human_agent', 'agent', 'system'])
  senderType?: 'bot' | 'human' | 'human_agent' | 'agent' | 'system';
}
