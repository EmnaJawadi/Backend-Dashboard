import { IsOptional, IsString } from 'class-validator';

export class RebuildCompanyKbDto {
  @IsOptional()
  @IsString()
  companyId?: string;
}
