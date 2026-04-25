import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../generated/prisma/client';

export class CreateCompanyRegistrationRequestDto {
  @IsString()
  @MaxLength(140)
  companyName!: string;

  @IsEmail()
  businessEmail!: string;

  @IsString()
  @MaxLength(40)
  phoneNumber!: string;

  @IsString()
  @MaxLength(140)
  responsibleFullName!: string;

  @IsOptional()
  @IsEnum(UserRole)
  requestedRole?: UserRole;

  @IsString()
  @MaxLength(80)
  businessType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  message?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password!: string;
}
