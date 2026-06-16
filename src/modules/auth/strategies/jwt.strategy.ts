import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../../common/enums/user-role.enum';
import { JwtPayload } from '../../../common/types/jwt-payload.type';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuthenticatedUser } from '../types/authenticated-user.type';

type JwtRequest = { headers?: { cookie?: string } };

function extractCookie(request: JwtRequest, name: string): string | null {
  const cookieHeader = request?.headers?.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_ACCESS_SECRET?.trim();
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: JwtRequest) => extractCookie(request, 'access_token'),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
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

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Invalid authentication payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        companyId: true,
        isActive: true,
        company: { select: { isActive: true, status: true } },
      },
    });

    if (
      !user ||
      !user.isActive ||
      user.email !== payload.email ||
      (user.company && (!user.company.isActive || user.company.status !== 'ACTIVE'))
    ) {
      throw new UnauthorizedException('Authentication session is no longer active');
    }

    return {
      sub: user.id,
      email: user.email,
      role: this.normalizeRole(user.role),
      companyId: user.companyId,
    };
  }
}
