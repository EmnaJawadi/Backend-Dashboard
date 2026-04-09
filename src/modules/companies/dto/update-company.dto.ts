<<<<<<< HEAD
export class UpdateCompanyDto {
  name?: string;
  legalName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
=======
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
>>>>>>> d897e51f6cca8f930cf0fa31c51094035cee49d2
  isActive?: boolean;
}