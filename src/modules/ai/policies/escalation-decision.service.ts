import { Injectable } from '@nestjs/common';

@Injectable()
export class EscalationDecisionService {
  decide(message: string, draftReply: string): {
    shouldEscalate: boolean;
    reason: string | null;
    confidence: number;
  } {
    const text = `${message} ${draftReply}`.toLowerCase();

    const riskyPatterns = [
      /refund/,
      /lawsuit/,
      /legal/,
      /angry/,
      /complaint/,
      /cancel/,
      /fraud/,
      /urgent/,
      /manager/,
      /human agent/,
    ];

    const matched = riskyPatterns.some((pattern) => pattern.test(text));

    return {
      shouldEscalate: matched,
      reason: matched ? 'Sensitive or high-risk support case detected.' : null,
      confidence: matched ? 0.88 : 0.55,
    };
  }
}