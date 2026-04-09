import { UserRole } from '../enums/user-role.enum';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string | null;
  lastName?: string | null;
  isActive?: boolean;
};