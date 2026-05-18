import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  AgentRegistrationStatus,
  CompanyRegistrationStatus,
  CompanyStatus,
  UserApprovalStatus,
} from '../../generated/prisma/client';
import { CompanyRegistrationService } from '../company-registration/company-registration.service';
import { MailService } from '../mail/mail.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthMapper } from './mappers/auth.mapper';

type ResetPasswordTokenPayload = {
  sub: string;
  email: string;
  passwordHash: string;
  type: 'password_reset';
};

type RefreshTokenPayload = JwtPayload & {
  type: 'refresh';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly companyRegistrationService: CompanyRegistrationService,
  ) {}

  private getAccessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  }

  private getRefreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret';
  }

  private getAccessExpiresIn(): StringValue | number {
    const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN?.trim();

    if (!expiresIn) {
      return '15m';
    }

    const asNumber = Number(expiresIn);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }

    return expiresIn as StringValue;
  }

  private getRefreshExpiresIn(): StringValue | number {
    const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN?.trim();

    if (!expiresIn) {
      return '7d';
    }

    const asNumber = Number(expiresIn);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }

    return expiresIn as StringValue;
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

  private async resolveUserFromAuthorization(authorization?: string) {
    if (!authorization) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const normalized = authorization.replace(/^Bearer\s+/i, '').trim();

    let userId: string | null = null;

    if (normalized.startsWith('access-')) {
      userId = normalized.replace('access-', '');
    } else {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(normalized, {
          secret: this.getAccessSecret(),
        });

        userId = payload.sub;
      } catch {
        throw new UnauthorizedException('Invalid token');
      }
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    return user;
  }

  private normalizeRole(role: string | UserRole | null | undefined): UserRole {
    if (role === UserRole.SUPER_ADMIN || role === 'supervisor') {
      return UserRole.SUPER_ADMIN;
    }

    if (role === UserRole.COMPANY_ADMIN || role === 'admin') {
      return UserRole.COMPANY_ADMIN;
    }

    if (role === UserRole.AGENT || role === 'agent') {
      return UserRole.AGENT;
    }

    return UserRole.EMPLOYEE;
  }

  private normalizeRoleFromInput(role: UserRole | undefined): UserRole {
    if (role === UserRole.SUPER_ADMIN) return UserRole.SUPER_ADMIN;
    if (role === UserRole.COMPANY_ADMIN) return UserRole.COMPANY_ADMIN;
    if (role === UserRole.EMPLOYEE) return UserRole.EMPLOYEE;
    return UserRole.AGENT;
  }

  private getPendingApprovalMessage(): string {
    return 'Votre compte est en attente d autorisation par l administrateur.';
  }

  private getRejectedApprovalMessage(): string {
    return 'Votre demande d inscription a ete refusee. Veuillez contacter l administration.';
  }

  private async getLatestRegistrationStatus(email: string) {
    return this.prisma.companyRegistrationRequest.findFirst({
      where: {
        businessEmail: {
          equals: email,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
      },
    });
  }

  private async getLatestAgentRegistrationStatus(email: string) {
    return this.prisma.agentRegistrationRequest.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
      },
    });
  }

  private async assertUserCanLogin(user: {
    id: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    approvalStatus?: UserApprovalStatus | null;
    companyId: string | null;
  }) {
    if (user.role === UserRole.SUPER_ADMIN) {
      if (!user.isActive) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return;
    }

    const latestRegistration = await this.getLatestRegistrationStatus(user.email);
    const latestAgentRegistration =
      user.role === UserRole.AGENT
        ? await this.getLatestAgentRegistrationStatus(user.email)
        : null;

    if (user.approvalStatus === UserApprovalStatus.REJECTED) {
      throw new UnauthorizedException(this.getRejectedApprovalMessage());
    }

    if (user.approvalStatus === UserApprovalStatus.PENDING) {
      throw new UnauthorizedException(this.getPendingApprovalMessage());
    }

    if (latestRegistration?.status === CompanyRegistrationStatus.REJECTED) {
      throw new UnauthorizedException(this.getRejectedApprovalMessage());
    }

    if (latestAgentRegistration?.status === AgentRegistrationStatus.REJECTED) {
      throw new UnauthorizedException(this.getRejectedApprovalMessage());
    }

    if (!user.isActive) {
      if (latestAgentRegistration?.status === AgentRegistrationStatus.PENDING) {
        throw new UnauthorizedException(this.getPendingApprovalMessage());
      }

      if (
        latestRegistration?.status === CompanyRegistrationStatus.PENDING_APPROVAL ||
        latestRegistration?.status === CompanyRegistrationStatus.NEEDS_MORE_INFO
      ) {
        throw new UnauthorizedException(this.getPendingApprovalMessage());
      }

      throw new UnauthorizedException(
        'Votre compte est inactif. Veuillez contacter l administration.',
      );
    }

    if (!user.companyId) {
      throw new UnauthorizedException(this.getPendingApprovalMessage());
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: {
        isActive: true,
        status: true,
      },
    });

    if (company?.status === CompanyStatus.SUSPENDED) {
      throw new UnauthorizedException(
        'L acces a votre entreprise est suspendu. Veuillez contacter l administration.',
      );
    }

    if (!company || !company.isActive || company.status === CompanyStatus.PENDING) {
      throw new UnauthorizedException(this.getPendingApprovalMessage());
    }
  }

  private async buildTokens(payload: JwtPayload): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getAccessSecret(),
      expiresIn: this.getAccessExpiresIn(),
    });

    const refreshToken = await this.jwtService.signAsync(
      {
        ...payload,
        type: 'refresh',
      },
      {
        secret: this.getRefreshSecret(),
        expiresIn: this.getRefreshExpiresIn(),
      },
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  private async buildAuthResponse(user: {
    id: string;
    fullName: string | null;
    email: string;
    role: string | UserRole;
    isActive: boolean;
    companyId: string | null;
  }) {
    const names = this.splitFullName(user.fullName);
    const role = this.normalizeRole(user.role);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role,
      companyId: user.companyId,
    };

    const tokens = await this.buildTokens(payload);

    return AuthMapper.toAuthResponse({
      user: {
        id: user.id,
        firstName: names.firstName,
        lastName: names.lastName,
        email: user.email,
        role,
        isActive: user.isActive,
        companyId: user.companyId,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }

  async register(registerUserDto: RegisterUserDto) {
    const firstName = registerUserDto.firstName.trim();
    const lastName = registerUserDto.lastName?.trim() || null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const role = this.normalizeRoleFromInput(registerUserDto.role);

    if (role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        'La creation de SUPER_ADMIN par register est interdite. Les SUPER_ADMIN sont crees uniquement par seed interne.',
      );
    }

    if (role !== UserRole.COMPANY_ADMIN) {
      throw new BadRequestException(
        'Le register public est reserve aux comptes COMPANY_ADMIN.',
      );
    }

    const companyName = registerUserDto.companyName?.trim();
    if (!companyName) {
      throw new BadRequestException(
        'companyName is required for COMPANY_ADMIN registration',
      );
    }

    const registration = await this.companyRegistrationService.createPublicRequest(
      {
        companyName,
        businessEmail: registerUserDto.email,
        phoneNumber: registerUserDto.phoneNumber?.trim() || 'N/A',
        responsibleFullName: fullName || registerUserDto.email.trim(),
        requestedRole: UserRole.COMPANY_ADMIN,
        businessType: registerUserDto.businessType?.trim() || 'Non precise',
        message: registerUserDto.message?.trim(),
        password: registerUserDto.password,
      },
      {
        requesterIp: null,
      },
    );

    return {
      message:
        'Votre demande d inscription a ete envoyee. Elle sera verifiee par l administration.',
      requestId: registration.data.id,
      status: registration.data.status,
    };
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        fullName: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        approvalStatus: true,
        companyId: true,
      },
    });

    if (!user) {
      const latestAgentRegistration =
        await this.getLatestAgentRegistrationStatus(email);

      if (latestAgentRegistration?.status === AgentRegistrationStatus.PENDING) {
        throw new UnauthorizedException(this.getPendingApprovalMessage());
      }

      if (latestAgentRegistration?.status === AgentRegistrationStatus.REJECTED) {
        throw new UnauthorizedException(this.getRejectedApprovalMessage());
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    const verification = await verifyPassword(loginDto.password, user.passwordHash);
    if (!verification.valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (verification.needsRehash) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(loginDto.password),
        },
      });
    }

    await this.assertUserCanLogin({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      approvalStatus: user.approvalStatus,
      companyId: user.companyId,
    });

    return this.buildAuthResponse({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      companyId: user.companyId,
    });
  }

  async refresh(refreshTokenDto: RefreshTokenDto) {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshTokenDto.refreshToken,
        {
          secret: this.getRefreshSecret(),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found');
    }

    await this.assertUserCanLogin({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      approvalStatus: user.approvalStatus,
      companyId: user.companyId,
    });

    return this.buildAuthResponse(user);
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
        throw new ServiceUnavailableException(
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
        passwordHash: await hashPassword(resetPasswordDto.newPassword),
      },
    });

    return { message: 'Password reset successful' };
  }

  async getProfileFromToken(token?: string) {
    const user = await this.resolveUserFromAuthorization(token);

    const names = this.splitFullName(user.fullName);

    return {
      id: user.id,
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: user.fullName ?? [names.firstName, names.lastName].filter(Boolean).join(' '),
      email: user.email,
      phoneNumber: null,
      role: this.normalizeRole(user.role),
      companyId: user.companyId,
      isActive: user.isActive,
    };
  }

  async updateProfileFromToken(
    authorization: string | undefined,
    updateProfileDto: UpdateProfileDto,
  ) {
    const user = await this.resolveUserFromAuthorization(authorization);

    if (
      updateProfileDto.firstName === undefined &&
      updateProfileDto.lastName === undefined
    ) {
      throw new BadRequestException('firstName or lastName is required');
    }

    const currentNames = this.splitFullName(user.fullName);

    const nextFirstName =
      updateProfileDto.firstName !== undefined
        ? updateProfileDto.firstName.trim()
        : currentNames.firstName;
    const nextLastName =
      updateProfileDto.lastName !== undefined
        ? updateProfileDto.lastName.trim() || null
        : currentNames.lastName;

    if (!nextFirstName) {
      throw new BadRequestException('firstName cannot be empty');
    }

    const fullName = [nextFirstName, nextLastName].filter(Boolean).join(' ');

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: fullName || null,
      },
    });

    return this.getProfileFromToken(`access-${updatedUser.id}`);
  }

  async changePasswordFromToken(
    authorization: string | undefined,
    changePasswordDto: ChangePasswordDto,
  ) {
    const user = await this.resolveUserFromAuthorization(authorization);

    const currentPasswordCheck = await verifyPassword(
      changePasswordDto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordCheck.valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSamePassword = await verifyPassword(
      changePasswordDto.newPassword,
      user.passwordHash,
    );
    if (isSamePassword.valid) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const newPasswordHash = await hashPassword(changePasswordDto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
      },
    });

    return { message: 'Password updated successfully' };
  }
}
