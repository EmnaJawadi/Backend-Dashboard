import { Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  MessageSenderType,
  MessageType,
} from '../entities/message.entity';

export class SaveMessageDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  direction?: 'inbound' | 'outbound';

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  caption?: string | null;

  @IsOptional()
  @IsString()
  mediaUrl?: string | null;

  @IsOptional()
  @IsString()
  mediaId?: string | null;

  @IsOptional()
  @IsString()
  mimeType?: string | null;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  instance?: string;

  @IsOptional()
  @IsString()
  instanceName?: string;

  @IsOptional()
  @IsString()
  rawRemoteJid?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsIn(['text', 'image', 'audio', 'document', 'video', 'button', 'list', 'unknown'])
  type?: MessageType;

  @IsOptional()
  @IsIn(['customer', 'human', 'human_agent', 'agent', 'bot', 'system'])
  senderType?: MessageSenderType;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : String(value),
  )
  @IsString()
  eventAt?: string | number;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}
