export class SendWhatsappMessageDto {
  phoneNumber!: string;
  message!: string;
  conversationId?: string;
}