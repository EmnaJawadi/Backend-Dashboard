import { UserRole } from '../enums/user-role.enum';

export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
};
