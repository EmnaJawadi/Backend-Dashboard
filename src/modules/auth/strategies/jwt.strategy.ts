import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../../common/enums/user-role.enum';
import { JwtPayload } from '../../../common/types/jwt-payload.type';
import { AuthenticatedUser } from '../types/authenticated-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    });
  }

  private normalizeRole(role: unknown): UserRole {
    if (role === UserRole.SUPER_ADMIN) return UserRole.SUPER_ADMIN;
    if (role === UserRole.COMPANY_ADMIN) return UserRole.COMPANY_ADMIN;
    if (role === UserRole.AGENT) return UserRole.AGENT;
    if (role === UserRole.EMPLOYEE) return UserRole.EMPLOYEE;

    if (role === 'supervisor') return UserRole.SUPER_ADMIN;
    if (role === 'admin') return UserRole.COMPANY_ADMIN;
    if (role === 'agent') return UserRole.AGENT;

    return UserRole.EMPLOYEE;
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Invalid authentication payload');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: this.normalizeRole(payload.role),
      companyId: payload.companyId ?? null,
    };
  }
}
