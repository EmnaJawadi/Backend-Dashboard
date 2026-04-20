import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class SendWhatsappMessageDto {
  @IsString()
  phoneNumber!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsISO8601()
  lastCustomerMessageAt?: string;

  @IsOptional()
  @IsString()
  senderId?: string;

  @IsOptional()
  @IsIn(['agent', 'bot', 'system'])
  senderType?: 'agent' | 'bot' | 'system';
}
