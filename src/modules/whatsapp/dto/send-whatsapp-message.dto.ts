import { IsOptional, IsString } from 'class-validator';

export class SendWhatsappMessageDto {
  @IsString()
  phoneNumber!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
