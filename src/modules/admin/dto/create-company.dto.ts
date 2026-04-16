import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
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
  @IsBoolean()
  isActive?: boolean;
}
