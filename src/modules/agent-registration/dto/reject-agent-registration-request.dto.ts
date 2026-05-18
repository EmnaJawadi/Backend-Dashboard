import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectAgentRegistrationRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  rejectionReason?: string;
}
