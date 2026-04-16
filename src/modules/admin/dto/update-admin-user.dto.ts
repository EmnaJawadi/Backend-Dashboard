import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { CreateAdminUserDto } from './create-admin-user.dto';

export class UpdateAdminUserDto extends PartialType(CreateAdminUserDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}
