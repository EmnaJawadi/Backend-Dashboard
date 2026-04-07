import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export type AnalyticsGroupBy = 'day' | 'week' | 'month';

export class ConversationsAnalyticsQuery {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['day', 'week', 'month'])
  groupBy?: AnalyticsGroupBy = 'day';
}