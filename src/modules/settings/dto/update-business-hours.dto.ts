import { BusinessHours } from '../entities/setting.entity';

export class UpdateBusinessHoursDto {
  enabled?: boolean;
  timezone?: string;
  days?: BusinessHours['days'];
}