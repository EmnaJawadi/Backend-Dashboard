export class UserQueryDto {
  /**
   * Optional search keyword (email/name...)
   */
  search?: string;

  /**
   * Pagination
   */
  page?: number;
  limit?: number;

  /**
   * Filters
   */
  role?: 'SUPER_ADMIN' | 'EMPLOYEE';
  isActive?: boolean;
}
