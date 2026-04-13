import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { AuthMapper } from './mappers/auth.mapper';

type PersistedRole = 'admin' | 'supervisor' | 'agent';
type ApiRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  private splitFullName(fullName?: string | null): {
    firstName: string;
    lastName: string | null;
  } {
    const normalized = (fullName ?? '').trim();
    if (!normalized) {
      return { firstName: 'User', lastName: null };
    }

    const parts = normalized.split(/\s+/);
    const firstName = parts.shift() ?? 'User';
    const lastName = parts.length > 0 ? parts.join(' ') : null;

    return { firstName, lastName };
  }

  private toPersistedRole(role: string | undefined): PersistedRole {
    if (role === 'ADMIN') return 'admin';
    if (role === 'AGENT') return 'agent';
    if (role === 'SUPER_ADMIN') return 'supervisor';

    const lowered = (role ?? '').toLowerCase();
    if (lowered === 'admin') return 'admin';
    if (lowered === 'agent') return 'agent';
    return 'supervisor';
  }

  private toApiRole(role: string | null | undefined): ApiRole {
    if (role === 'agent') return 'AGENT';
    if (role === 'admin') return 'ADMIN';
    if (role === 'supervisor') return 'SUPER_ADMIN';

    if (role === 'AGENT') return 'AGENT';
    if (role === 'ADMIN') return 'ADMIN';
    if (role === 'SUPER_ADMIN') return 'SUPER_ADMIN';

    return 'AGENT';
  }

  async register(registerUserDto: RegisterUserDto) {
    const email = registerUserDto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new UnauthorizedException('User already exists');
    }

    const firstName = registerUserDto.firstName.trim();
    const lastName = registerUserDto.lastName?.trim() || null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const role: PersistedRole = this.toPersistedRole(registerUserDto.role);
    const now = new Date();

    const user = await this.prisma.user.create({
      data: {
        fullName: fullName || null,
        email,
        passwordHash: this.hashPassword(registerUserDto.password),
        role,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    const names = this.splitFullName(user.fullName);

    return AuthMapper.toAuthResponse({
      user: {
        id: user.id,
        firstName: names.firstName,
        lastName: names.lastName,
        email: user.email,
        role: this.toApiRole(user.role),
        isActive: user.isActive,
      },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
    });
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = this.hashPassword(loginDto.password);
    if (user.passwordHash !== passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const names = this.splitFullName(user.fullName);

    return AuthMapper.toAuthResponse({
      user: {
        id: user.id,
        firstName: names.firstName,
        lastName: names.lastName,
        email: user.email,
        role: this.toApiRole(user.role),
        isActive: user.isActive,
      },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
    });
  }

  async refresh(refreshTokenDto: RefreshTokenDto) {
    if (!refreshTokenDto.refreshToken?.startsWith('refresh-')) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const userId = refreshTokenDto.refreshToken.replace('refresh-', '');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    const names = this.splitFullName(user.fullName);

    return AuthMapper.toAuthResponse({
      user: {
        id: user.id,
        firstName: names.firstName,
        lastName: names.lastName,
        email: user.email,
        role: this.toApiRole(user.role),
        isActive: user.isActive,
      },
      accessToken: `access-${user.id}`,
      refreshToken: `refresh-${user.id}`,
    });
  }

  async getProfileFromToken(token?: string) {
    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const normalized = token.replace('Bearer ', '');
    const userId = normalized.replace('access-', '');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const names = this.splitFullName(user.fullName);

    return {
      id: user.id,
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: user.fullName ?? [names.firstName, names.lastName].filter(Boolean).join(' '),
      email: user.email,
      phoneNumber: null,
      role: this.toApiRole(user.role),
      isActive: user.isActive,
    };
  }
}
