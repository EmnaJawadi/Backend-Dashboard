import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AgentRegistrationStatus } from '../../../generated/prisma/client';

export class QueryAgentRegistrationRequestsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(AgentRegistrationStatus)
  status?: AgentRegistrationStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
