import { Type } from 'class-transformer';
import { IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { NotificationType } from '../../../generated/prisma/client';

export class QueryNotificationsDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsBooleanString()
  isRead?: string;

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
}
