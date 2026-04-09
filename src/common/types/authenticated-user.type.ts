export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'EMPLOYEE';
  companyId: string | null;
};