import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAgentRegistrationRequestDto {
  @IsString()
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MaxLength(80)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(120)
  password!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(120)
  confirmPassword!: string;

  @IsString()
  @MaxLength(140)
  companyName!: string;
}
