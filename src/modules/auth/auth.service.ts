import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthMapper } from './mappers/auth.mapper';

type PersistedRole = 'admin' | 'supervisor' | 'agent';
type ApiRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';

type ResetPasswordTokenPayload = {
  sub: string;
  email: string;
  passwordHash: string;
  type: 'password_reset';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  private getResetPasswordSecret(): string {
    return (
      process.env.JWT_RESET_PASSWORD_SECRET ??
      process.env.JWT_ACCESS_SECRET ??
      'dev-reset-password-secret'
    );
  }

  private getResetPasswordExpiresIn(): StringValue | number {
    const expiresIn = process.env.JWT_RESET_PASSWORD_EXPIRES_IN?.trim();

    if (!expiresIn) {
      return '30m';
    }

    const asNumber = Number(expiresIn);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }

    return expiresIn as StringValue;
  }

  private buildResetPasswordLink(token: string): string {
    const baseUrl =
      process.env.RESET_PASSWORD_BASE_URL?.trim() ||
      'http://localhost:3000/reset-password';

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
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

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const email = forgotPasswordDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user?.isActive) {
      const payload: ResetPasswordTokenPayload = {
        sub: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        type: 'password_reset',
      };

      const token = await this.jwtService.signAsync(payload, {
        secret: this.getResetPasswordSecret(),
        expiresIn: this.getResetPasswordExpiresIn(),
      });

      const resetLink = this.buildResetPasswordLink(token);
      const isSent = await this.mailService.sendForgotPasswordEmail({
        to: user.email,
        fullName: user.fullName ?? undefined,
        resetLink,
      });

      if (!isSent) {
        const reason = this.mailService.getLastErrorMessage();
        throw new InternalServerErrorException(
          reason ?? 'Unable to send password reset email',
        );
      }
    }

    return {
      message:
        'If an account exists for this email, a reset link has been sent.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    let payload: ResetPasswordTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<ResetPasswordTokenPayload>(
        resetPasswordDto.token,
        {
          secret: this.getResetPasswordSecret(),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if (payload.type !== 'password_reset') {
      throw new UnauthorizedException('Invalid reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid reset token');
    }

    if (payload.email !== user.email || payload.passwordHash !== user.passwordHash) {
      throw new UnauthorizedException('Reset token is no longer valid');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: this.hashPassword(resetPasswordDto.newPassword),
        updatedAt: new Date(),
      },
    });

    return { message: 'Password reset successful' };
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
