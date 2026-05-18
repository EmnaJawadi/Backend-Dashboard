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

    if (
      /\b[A-Z]{2,10}-\d{2,6}\b/i.test(reply) ||
      /\b(Code article|Cat[ée]gorie|Mots-cl[ée]s|Source|metadata|chunkIndex|sourceUrl|articleId)\s*:/i.test(
        reply,
      ) ||
      /^\s*[{[]/.test(reply.trim())
    ) {
      return {
        valid: false,
        reason: 'Reply exposes internal knowledge-base data.',
      };
    }

    return {
      valid: true,
      reason: null,
    };
  }
}
