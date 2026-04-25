import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateWhatsappPolicyDto {
  @IsOptional()
  @IsString()
  businessPhoneNumber?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  verifyToken?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  businessAccountId?: string;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsIn(['connected', 'disconnected'])
  connectionStatus?: 'connected' | 'disconnected';

  @IsOptional()
  @IsString()
  defaultCountryCode?: string;

  @IsOptional()
  @IsBoolean()
  verifyWebhookSignature?: boolean;
}
