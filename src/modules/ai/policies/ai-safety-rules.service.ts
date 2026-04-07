import { Injectable } from '@nestjs/common';

@Injectable()
export class AiSafetyRulesService {
  private readonly blockedPatterns: RegExp[] = [
    /password/i,
    /credit card/i,
    /cvv/i,
    /bank account/i,
    /secret key/i,
    /api key/i,
  ];

  evaluate(message: string): { safe: boolean; reason: string | null } {
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(message)) {
        return {
          safe: false,
          reason: 'Sensitive information detected in the message.',
        };
      }
    }

    return {
      safe: true,
      reason: null,
    };
  }
}