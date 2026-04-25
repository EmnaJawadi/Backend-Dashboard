import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CompanyRegistrationStatus } from '../../../generated/prisma/client';

export class QueryCompanyRegistrationRequestsDto {
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
  @IsEnum(CompanyRegistrationStatus)
  status?: CompanyRegistrationStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
