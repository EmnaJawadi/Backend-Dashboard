export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  AGENT: 'AGENT',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES: Role[] = Object.values(ROLES);
