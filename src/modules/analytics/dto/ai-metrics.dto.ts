export class AnalyticsTimelinePointDto {
  label: string;
  value: number;

  constructor(partial?: Partial<AnalyticsTimelinePointDto>) {
    this.label = '';
    this.value = 0;

    Object.assign(this, partial);
  }
}

export class AiMetricsDto {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  averageLatencyMs: number;
  averageConfidenceScore: number;
  totalTokensUsed: number;
  averageTokensUsed: number;
  totalEstimatedCost: number;
  timeline: AnalyticsTimelinePointDto[];

  constructor(partial?: Partial<AiMetricsDto>) {
    this.totalRuns = 0;
    this.successfulRuns = 0;
    this.failedRuns = 0;
    this.successRate = 0;
    this.averageLatencyMs = 0;
    this.averageConfidenceScore = 0;
    this.totalTokensUsed = 0;
    this.averageTokensUsed = 0;
    this.totalEstimatedCost = 0;
    this.timeline = [];

    Object.assign(this, partial);
  }
}