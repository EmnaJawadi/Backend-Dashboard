import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SubscriptionStatus } from '../../../generated/prisma/client';

export class CreateAdminSubscriptionDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  plan!: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
