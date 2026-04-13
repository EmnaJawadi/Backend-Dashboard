import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { QuerySubscriptionsDto } from './dto/query-subscriptions.dto';
import { SubscriptionEntity } from './entities/subscription.entity';

@Injectable()
export class SubscriptionsRepository {
  private readonly subscriptions: SubscriptionEntity[] = [];

  create(data: Partial<SubscriptionEntity>): SubscriptionEntity {
    const now = new Date();

    const subscription = new SubscriptionEntity({
      id: randomUUID(),
      plan: data.plan?.trim() ?? 'starter',
      status: data.status?.trim() ?? 'active',
      billingCycle: data.billingCycle?.trim() ?? 'monthly',
      price: data.price ?? 0,
      currency: data.currency?.trim() ?? 'USD',
      startDate: data.startDate ?? now,
      endDate: data.endDate ?? null,
      autoRenew: data.autoRenew ?? true,
      createdAt: now,
      updatedAt: now,
    });

    this.subscriptions.push(subscription);

    return subscription;
  }

  findMany(query: QuerySubscriptionsDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    let data = [...this.subscriptions];

    if (query.search) {
      const search = query.search.toLowerCase();

      data = data.filter(
        (subscription) =>
          subscription.plan.toLowerCase().includes(search) ||
          subscription.status.toLowerCase().includes(search) ||
          subscription.billingCycle.toLowerCase().includes(search) ||
          subscription.currency.toLowerCase().includes(search),
      );
    }

    if (query.plan) {
      data = data.filter((subscription) => subscription.plan === query.plan);
    }

    if (query.status) {
      data = data.filter((subscription) => subscription.status === query.status);
    }

    if (query.billingCycle) {
      data = data.filter(
        (subscription) => subscription.billingCycle === query.billingCycle,
      );
    }

    if (query.autoRenew !== undefined) {
      const autoRenew = query.autoRenew === 'true';
      data = data.filter(
        (subscription) => subscription.autoRenew === autoRenew,
      );
    }

    const total = data.length;
    const start = (page - 1) * limit;
    const paginated = data.slice(start, start + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  findById(id: string): SubscriptionEntity {
    const subscription = this.subscriptions.find((item) => item.id === id);

    if (!subscription) {
      throw new NotFoundException(`Subscription with id ${id} not found`);
    }

    return subscription;
  }

  update(id: string, data: Partial<SubscriptionEntity>): SubscriptionEntity {
    const subscription = this.findById(id);

    if (data.plan !== undefined) {
      subscription.plan = data.plan.trim();
    }

    if (data.status !== undefined) {
      subscription.status = data.status.trim();
    }

    if (data.billingCycle !== undefined) {
      subscription.billingCycle = data.billingCycle.trim();
    }

    if (data.price !== undefined) {
      subscription.price = data.price;
    }

    if (data.currency !== undefined) {
      subscription.currency = data.currency.trim();
    }

    if (data.startDate !== undefined) {
      subscription.startDate = data.startDate;
    }

    if (data.endDate !== undefined) {
      subscription.endDate = data.endDate;
    }

    if (data.autoRenew !== undefined) {
      subscription.autoRenew = data.autoRenew;
    }

    subscription.updatedAt = new Date();

    return subscription;
  }

  remove(id: string): SubscriptionEntity {
    const index = this.subscriptions.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Subscription with id ${id} not found`);
    }

    const deleted = this.subscriptions[index];
    this.subscriptions.splice(index, 1);

    return deleted;
  }
}
