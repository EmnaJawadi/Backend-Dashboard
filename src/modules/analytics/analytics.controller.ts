import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ConversationsAnalyticsQuery } from './queries/conversations-analytics.query';
import { AiRunsAnalyticsQuery } from './queries/ai-runs-analytics.query';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  getOverview(
    @Query() query: ConversationsAnalyticsQuery,
  ) {
    return this.analyticsService.getOverview(query);
  }

  @Get('conversations')
  getConversationMetrics(
    @Query() query: ConversationsAnalyticsQuery,
  ) {
    return this.analyticsService.getConversationMetrics(query);
  }

  @Get('ai-runs')
  getAiRunsMetrics(
    @Query() query: AiRunsAnalyticsQuery,
  ) {
    return this.analyticsService.getAiRunsMetrics(query);
  }
}