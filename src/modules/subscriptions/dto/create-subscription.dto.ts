export class CreateSubscriptionDto {
  plan!: string;
  status?: string;
  billingCycle?: string;
  price?: number;
  currency?: string;
  startDate?: string;
  endDate?: string | null;
  autoRenew?: boolean;
}
