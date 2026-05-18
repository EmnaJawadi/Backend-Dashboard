import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';
import { AuthenticatedUser } from '../types/authenticated-user.type';

export function resolveCompanyScope(actor?: AuthenticatedUser): string | undefined {
  if (!actor || actor.role === UserRole.SUPER_ADMIN) {
    return undefined;
  }

  if (!actor.companyId) {
    throw new ForbiddenException('User is not linked to a company');
  }

  return actor.companyId;
}
