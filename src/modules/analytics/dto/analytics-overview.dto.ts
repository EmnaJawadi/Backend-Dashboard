import { AiMetricsDto } from './ai-metrics.dto';
import { ConversationMetricsDto } from './conversation-metrics.dto';

export class AnalyticsOverviewDto {
  generatedAt: string;
  period: {
    startDate: string | null;
    endDate: string | null;
    groupBy: 'day' | 'week' | 'month';
  };
  conversations: ConversationMetricsDto;
  aiRuns: AiMetricsDto;

  constructor(partial?: Partial<AnalyticsOverviewDto>) {
    this.generatedAt = new Date().toISOString();
    this.period = {
      startDate: null,
      endDate: null,
      groupBy: 'day',
    };
    this.conversations = new ConversationMetricsDto({});
    this.aiRuns = new AiMetricsDto({});

    Object.assign(this, partial);
  }
}