import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class UpdateBusinessHoursDayDto {
  @IsOptional()
  @IsString()
  day?: string;

  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateBusinessHoursDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  autoReplyOutsideHours?: boolean;

  @IsOptional()
  @IsString()
  outOfHoursMessage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateBusinessHoursDayDto)
  days?: UpdateBusinessHoursDayDto[];
}
