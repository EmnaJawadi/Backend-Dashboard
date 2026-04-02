import { UserRole } from '../entities/user.entity';

export class UserQueryDto {
  search?: string;
  role?: UserRole;
  isActive?: string;
  page?: number;
  limit?: number;
}