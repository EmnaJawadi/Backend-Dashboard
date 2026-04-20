import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AiReplyContextItemDto {
  @IsString()
  @IsIn(['user', 'assistant', 'system'])
  role!: 'user' | 'assistant' | 'system';

  @IsString()
  content!: string;
}

export class AiReplyRequestDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsIn(['inbound', 'outbound', 'system'])
  direction?: 'inbound' | 'outbound' | 'system';

  @IsOptional()
  @IsString()
  messageType?: string;

  @IsOptional()
  @IsISO8601()
  lastCustomerMessageAt?: string;

  @IsOptional()
  @IsBoolean()
  shadowMode?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiReplyContextItemDto)
  history?: AiReplyContextItemDto[];
}
