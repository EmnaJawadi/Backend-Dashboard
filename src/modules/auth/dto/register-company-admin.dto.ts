import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterCompanyAdminDto {
  // user fields
  @IsString()
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string | null;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string | null;

  // company fields
  @IsString()
  companyName!: string;

  @IsOptional()
  @IsEmail()
  companyEmail?: string | null;

  @IsOptional()
  @IsString()
  companyPhone?: string | null;

  @IsOptional()
  @IsString()
  companyAddress?: string | null;
}