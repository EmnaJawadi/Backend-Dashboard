import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class WorkflowHandoffDto {
  @IsString()
  conversationId!: string;

  @IsOptional()
  @IsBoolean()
  handoffRequired?: boolean;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
