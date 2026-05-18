import { IsIn, IsOptional, IsString } from 'class-validator';

export class SendWhatsappMessageDto {
  @IsString()
  phoneNumber!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsOptional()
  @IsString()
  instanceName?: string;

  @IsOptional()
  @IsIn(['human', 'human_agent', 'agent', 'bot', 'system'])
  senderType?: 'human' | 'human_agent' | 'agent' | 'bot' | 'system';
}
