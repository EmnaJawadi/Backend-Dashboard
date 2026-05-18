import { Injectable } from '@nestjs/common';

export type ConversationWindowReason =
  | 'NO_CUSTOMER_MESSAGE'
  | 'WINDOW_EXPIRED';

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
    const parsedLastCustomerMessageAt = this.parseDate(lastCustomerMessageAt);

    if (!parsedLastCustomerMessageAt) {
      return {
        isWithinWindow: false,
        isOpen: false,
        canSendFreeForm: false,
        reason: 'NO_CUSTOMER_MESSAGE',
        remainingHours: 0,
        expiresAt: null,
        lastCustomerMessageAt: null,
        windowHours: this.defaultWindowHours,
      };
    }

    const expiresAt = new Date(
      parsedLastCustomerMessageAt.getTime() +
        this.defaultWindowHours * 60 * 60 * 1000,
    );
    const remainingMs = expiresAt.getTime() - now.getTime();
    const isWithinWindow = remainingMs > 0;

    return {
      isWithinWindow,
      isOpen: isWithinWindow,
      canSendFreeForm: isWithinWindow,
      reason: isWithinWindow ? null : 'WINDOW_EXPIRED',
      remainingHours: isWithinWindow
        ? Number((remainingMs / (60 * 60 * 1000)).toFixed(2))
        : 0,
      expiresAt,
      lastCustomerMessageAt: parsedLastCustomerMessageAt,
      windowHours: this.defaultWindowHours,
    };
  }

  private parseDate(value?: string | number | Date | null): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const asMs = value > 1_000_000_000_000 ? value : value * 1000;
      const parsed = new Date(asMs);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }
}
