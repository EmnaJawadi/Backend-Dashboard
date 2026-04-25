import { Injectable } from '@nestjs/common';

export type ConversationWindowReason =
  | 'ALWAYS_OPEN';

export type ConversationWindowStatus = {
  isWithinWindow: boolean;
  isOpen: boolean;
  canSendFreeForm: boolean;
  reason: ConversationWindowReason | null;
  remainingHours: number;
  expiresAt: Date | null;
  lastCustomerMessageAt: Date | null;
  windowHours: number;
};

@Injectable()
export class ConversationWindowService {
  private readonly defaultWindowHours = 24;

  checkWindow(
    lastCustomerMessageAt?: string | number | Date | null,
    now = new Date(),
  ): ConversationWindowStatus {
    return {
      isWithinWindow: true,
      isOpen: true,
      canSendFreeForm: true,
      reason: null,
      remainingHours: this.defaultWindowHours,
      expiresAt: null,
      lastCustomerMessageAt:
        lastCustomerMessageAt instanceof Date ? lastCustomerMessageAt : now,
      windowHours: this.defaultWindowHours,
    };
  }
}
