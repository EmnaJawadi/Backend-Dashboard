import { Injectable } from '@nestjs/common';

export type ConversationWindowReason =
  | 'NO_CUSTOMER_MESSAGE'
  | 'INVALID_LAST_CUSTOMER_MESSAGE_AT'
  | '24_HOUR_WINDOW_CLOSED';

export type ConversationWindowStatus = {
  isWithinWindow: boolean;
  isOpen: boolean;
  canSendFreeForm: boolean;
  templateRequired: boolean;
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
    lastCustomerMessageAt?: string | Date | null,
    now = new Date(),
  ): ConversationWindowStatus {
    if (!lastCustomerMessageAt) {
      return this.closedWindow('NO_CUSTOMER_MESSAGE', null);
    }

    const lastDate =
      lastCustomerMessageAt instanceof Date
        ? lastCustomerMessageAt
        : new Date(lastCustomerMessageAt);

    if (Number.isNaN(lastDate.getTime())) {
      return this.closedWindow('INVALID_LAST_CUSTOMER_MESSAGE_AT', null);
    }

    const expiresAt = new Date(
      lastDate.getTime() + this.defaultWindowHours * 60 * 60 * 1000,
    );

    const isWithinWindow = now.getTime() <= expiresAt.getTime();
    const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
    const remainingHours = Number(
      (remainingMs / (60 * 60 * 1000)).toFixed(2),
    );

    return {
      isWithinWindow,
      isOpen: isWithinWindow,
      canSendFreeForm: isWithinWindow,
      templateRequired: !isWithinWindow,
      reason: isWithinWindow ? null : '24_HOUR_WINDOW_CLOSED',
      remainingHours,
      expiresAt,
      lastCustomerMessageAt: lastDate,
      windowHours: this.defaultWindowHours,
    };
  }

  private closedWindow(
    reason: ConversationWindowReason,
    lastCustomerMessageAt: Date | null,
  ): ConversationWindowStatus {
    return {
      isWithinWindow: false,
      isOpen: false,
      canSendFreeForm: false,
      templateRequired: true,
      reason,
      remainingHours: 0,
      expiresAt: null,
      lastCustomerMessageAt,
      windowHours: this.defaultWindowHours,
    };
  }
}
