import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MetricsAggregationScheduler {
  private readonly logger = new Logger(MetricsAggregationScheduler.name);

  async runAggregation() {
    this.logger.log('Running metrics aggregation...');
    // TODO: aggregate analytics
  }
}