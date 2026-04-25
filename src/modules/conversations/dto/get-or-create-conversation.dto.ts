import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class GetOrCreateConversationDto {
  @IsString()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  rawRemoteJid?: string;

  @IsOptional()
  @IsString()
  instance?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  messageText?: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null ? undefined : String(value),
  )
  @IsString()
  eventAt?: string | number;
}
