import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { NotificationPriority, NotificationType } from '../../../generated/prisma/client';

export class CreateNotificationDto {
  @IsOptional()
  @IsString()
  companyId?: string | null;

  @IsOptional()
  @IsString()
  conversationId?: string | null;

  @IsOptional()
  @IsString()
  contactId?: string | null;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsString()
  title!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;
}
