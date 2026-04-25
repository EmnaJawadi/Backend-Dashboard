import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectCompanyRegistrationRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  rejectionReason?: string;
}
