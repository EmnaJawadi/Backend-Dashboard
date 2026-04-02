import { Injectable } from '@nestjs/common';

@Injectable()
export class ConversationWindowService {
  private readonly defaultWindowHours = 24;

  checkWindow(lastCustomerMessageAt?: string) {
    if (!lastCustomerMessageAt) {
      return {
        isOpen: false,
        remainingHours: 0,
        expiresAt: null,
      };
    }

    const lastDate = new Date(lastCustomerMessageAt);
    const expiresAt = new Date(
      lastDate.getTime() + this.defaultWindowHours * 60 * 60 * 1000,
    );

    const now = new Date();
    const isOpen = now.getTime() <= expiresAt.getTime();
    const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
    const remainingHours = Number(
      (remainingMs / (60 * 60 * 1000)).toFixed(2),
    );

    return {
      isOpen,
      remainingHours,
      expiresAt,
    };
  }
}