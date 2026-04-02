import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
  firstName?: string;
  lastName?: string | null;
  email?: string;
  phoneNumber?: string | null;
  role?: UserRole;
  isActive?: boolean;
}