import { Injectable } from '@nestjs/common';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { QuerySubscriptionsDto } from './dto/query-subscriptions.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  create(createSubscriptionDto: CreateSubscriptionDto) {
    return this.subscriptionsRepository.create({
      companyId: createSubscriptionDto.companyId,
      plan: createSubscriptionDto.plan,
      status: createSubscriptionDto.status ?? 'active',
      billingCycle: createSubscriptionDto.billingCycle ?? 'monthly',
      price: createSubscriptionDto.price ?? 0,
      currency: createSubscriptionDto.currency ?? 'USD',
      startDate: createSubscriptionDto.startDate
        ? new Date(createSubscriptionDto.startDate)
        : new Date(),
      endDate: createSubscriptionDto.endDate
        ? new Date(createSubscriptionDto.endDate)
        : null,
      autoRenew: createSubscriptionDto.autoRenew ?? true,
    });
  }

  findAll(query: QuerySubscriptionsDto) {
    return this.subscriptionsRepository.findMany(query);
  }

  findOne(id: string) {
    return this.subscriptionsRepository.findById(id);
  }

  update(id: string, updateSubscriptionDto: UpdateSubscriptionDto) {
    return this.subscriptionsRepository.update(id, {
      companyId: updateSubscriptionDto.companyId,
      plan: updateSubscriptionDto.plan,
      status: updateSubscriptionDto.status,
      billingCycle: updateSubscriptionDto.billingCycle,
      price: updateSubscriptionDto.price,
      currency: updateSubscriptionDto.currency,
      startDate: updateSubscriptionDto.startDate
        ? new Date(updateSubscriptionDto.startDate)
        : undefined,
      endDate:
        updateSubscriptionDto.endDate === null
          ? null
          : updateSubscriptionDto.endDate
            ? new Date(updateSubscriptionDto.endDate)
            : undefined,
      autoRenew: updateSubscriptionDto.autoRenew,
    });
  }

  remove(id: string) {
    return this.subscriptionsRepository.remove(id);
  }
}