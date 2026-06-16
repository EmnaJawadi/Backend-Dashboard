import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class N8nNormalizedMessageDto {
  @IsOptional()
  @IsBoolean()
  inboundValid?: boolean;

  @IsOptional()
  @IsString()
  direction?: string;

  @IsOptional()
  @IsString()
  senderType?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsString()
  instance?: string;

  @IsOptional()
  @IsString()
  instanceName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  businessPhoneNumber?: string;

  @IsOptional()
  @IsString()
  rawRemoteJid?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  messageText?: string;

  @IsOptional()
  @IsString()
  caption?: string | null;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsBoolean()
  hasMedia?: boolean;

  @IsOptional()
  @IsString()
  mediaType?: string | null;

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
  @IsBoolean()
  fromMe?: boolean;

  @IsOptional()
  @IsString()
  messageId?: string;

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
