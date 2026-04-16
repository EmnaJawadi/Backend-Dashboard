import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { SubscriptionStatus } from '../../../generated/prisma/client';

export class SetSubscriptionStatusDto {
  @IsEnum(SubscriptionStatus)
  status!: SubscriptionStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
