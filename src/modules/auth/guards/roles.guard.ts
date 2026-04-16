import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../types/authenticated-user.type';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private normalizeRole(role: string | UserRole): UserRole {
    if (role === UserRole.SUPER_ADMIN) return UserRole.SUPER_ADMIN;
    if (role === UserRole.COMPANY_ADMIN) return UserRole.COMPANY_ADMIN;
    if (role === UserRole.AGENT) return UserRole.AGENT;
    if (role === UserRole.EMPLOYEE) return UserRole.EMPLOYEE;

    if (role === 'supervisor') return UserRole.SUPER_ADMIN;
    if (role === 'admin') return UserRole.COMPANY_ADMIN;
    if (role === 'agent') return UserRole.AGENT;

    return UserRole.EMPLOYEE;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>('roles', [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) throw new ForbiddenException('Not authenticated');

    const userRole = this.normalizeRole(user.role);
    if (
      userRole !== UserRole.SUPER_ADMIN &&
      !requiredRoles.includes(userRole)
    ) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
