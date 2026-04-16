import { PartialType } from '@nestjs/mapped-types';
import { CreateAdminSubscriptionDto } from './create-admin-subscription.dto';

export class UpdateAdminSubscriptionDto extends PartialType(CreateAdminSubscriptionDto) {}
