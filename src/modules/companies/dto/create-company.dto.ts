
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsString()
  ownerId!: string;

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
  isActive?: boolean;
}