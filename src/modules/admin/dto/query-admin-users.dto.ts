import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryAdminUsersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  isActive?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}
