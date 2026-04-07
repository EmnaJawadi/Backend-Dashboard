import { AnalyticsTimelinePointDto } from './ai-metrics.dto';

export class ConversationMetricsDto {
  totalConversations: number;
  openConversations: number;
  closedConversations: number;
  resolutionRate: number;
  averageMessagesPerConversation: number;
  averageFirstResponseTimeMs: number;
  averageResolutionTimeMs: number;
  timeline: AnalyticsTimelinePointDto[];

  constructor(partial?: Partial<ConversationMetricsDto>) {
    this.totalConversations = 0;
    this.openConversations = 0;
    this.closedConversations = 0;
    this.resolutionRate = 0;
    this.averageMessagesPerConversation = 0;
    this.averageFirstResponseTimeMs = 0;
    this.averageResolutionTimeMs = 0;
    this.timeline = [];

    Object.assign(this, partial);
  }
}