import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompanyWhatsappConnectDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  evolutionInstanceName?: string;
}

export class UpdateCompanyWhatsappInstanceDto {
  @IsOptional()
  @IsString()
  evolutionInstanceName?: string;

  @IsOptional()
  @IsString()
  businessPhoneNumber?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  businessAccountId?: string;

  @IsOptional()
  @IsString()
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
