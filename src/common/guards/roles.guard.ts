import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import { AuthenticatedUser } from '../types/authenticated-user.type';

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
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    const userRole = this.normalizeRole(user.role);

    if (userRole === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (!requiredRoles.includes(userRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
