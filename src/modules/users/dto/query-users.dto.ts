<<<<<<< HEAD
export class QueryUsersDto {
  page?: string;
  limit?: string;
  search?: string;
  role?: string;
  companyId?: string;
  isActive?: string;
=======
import { IsOptional, IsString } from 'class-validator';

export class QueryUsersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  role?: string;
>>>>>>> d897e51f6cca8f930cf0fa31c51094035cee49d2
}