import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ConversationCleanupScheduler {
  private readonly logger = new Logger(ConversationCleanupScheduler.name);

  async runCleanup() {
    this.logger.log('Running conversation cleanup...');
  }
}