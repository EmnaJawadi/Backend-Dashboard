export class SubscriptionEntity {
  id!: string;
  plan!: string;
  status!: string;
  billingCycle!: string;
  price!: number;
  currency!: string;
  startDate!: Date;
  endDate?: Date | null;
  autoRenew!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<SubscriptionEntity>) {
    Object.assign(this, partial);
  }
}
