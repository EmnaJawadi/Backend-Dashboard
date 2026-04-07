import { Injectable } from '@nestjs/common';

@Injectable()
export class HallucinationGuardService {
  validateReply(reply: string): {
    valid: boolean;
    reason: string | null;
  } {
    if (!reply || !reply.trim()) {
      return {
        valid: false,
        reason: 'Empty AI reply.',
      };
    }

    if (reply.length > 3000) {
      return {
        valid: false,
        reason: 'Reply is too long.',
      };
    }

    return {
      valid: true,
      reason: null,
    };
  }
}