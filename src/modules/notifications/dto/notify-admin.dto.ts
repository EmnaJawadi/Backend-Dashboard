import { IsOptional, IsString } from 'class-validator';

export class NotifyAdminDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  message?: string;
}
