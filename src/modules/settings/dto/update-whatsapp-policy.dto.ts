import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
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
  @IsInt()
  @Min(1)
  sessionWindowHours?: number;

  @IsOptional()
  @IsBoolean()
  allowTemplatesOutsideWindow?: boolean;

  @IsOptional()
  @IsString()
  defaultCountryCode?: string;

  @IsOptional()
  @IsBoolean()
  verifyWebhookSignature?: boolean;
}
