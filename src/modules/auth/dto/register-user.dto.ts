import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';

export class RegisterUserDto {
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

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}
