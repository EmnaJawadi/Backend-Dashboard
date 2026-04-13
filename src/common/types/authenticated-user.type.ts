export type AuthenticatedUser = {
  sub: string;
  email: string;
  role: 'SUPER_ADMIN' | 'EMPLOYEE';
};
