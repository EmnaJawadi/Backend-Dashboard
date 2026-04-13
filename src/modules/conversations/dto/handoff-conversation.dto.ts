import { IsOptional, IsString } from 'class-validator';

export class HandoffConversationDto {
  @IsString()
  assignedTo!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
