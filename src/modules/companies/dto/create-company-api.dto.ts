import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { CompanyStatus } from '../../../generated/prisma/client';

export class CreateCompanyApiDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  legalName?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  website?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}
