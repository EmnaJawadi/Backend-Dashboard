import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateWorkflowPolicyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  primaryTag?: string;

  @IsOptional()
  @IsString()
  defaultAgent?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsString()
  preHandoffMessage?: string;
}
