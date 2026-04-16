import { UserRole } from '../enums/user-role.enum';

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  iat?: number;
  exp?: number;
};
