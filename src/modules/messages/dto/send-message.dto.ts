import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { MessageType } from '../entities/message.entity';

const MessageTypeValues = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  document: 'document',
  video: 'video',
  button: 'button',
  list: 'list',
  unknown: 'unknown',
} as const;

export class SendMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsEnum(MessageTypeValues)
  type?: MessageType;

  @IsOptional()
  @IsString()
  senderId?: string | null;
}
