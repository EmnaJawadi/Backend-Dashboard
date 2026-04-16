import { UserRole as PrismaUserRole } from '../../generated/prisma/client';

export const UserRole = PrismaUserRole;
export type UserRole = PrismaUserRole;

export const USER_ROLE_VALUES: UserRole[] = Object.values(UserRole);
