import { IsOptional, IsString } from 'class-validator';

export class NotifyAgentAssignedDto {
  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  contactName?: string;
}
