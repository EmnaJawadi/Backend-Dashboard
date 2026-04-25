import { IsOptional, IsString } from 'class-validator';

export class ConnectCompanyWhatsappDto {
  @IsOptional()
  @IsString()
  evolutionInstanceName?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;
}
