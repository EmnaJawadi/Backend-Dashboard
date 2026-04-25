import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CompanyRegistrationStatus,
  CompanyStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  UserRole,
  WhatsappConnectionStatus,
} from '../../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { ApproveCompanyRegistrationRequestDto } from './dto/approve-company-registration-request.dto';
import { CreateCompanyRegistrationRequestDto } from './dto/create-company-registration-request.dto';
import { NeedsMoreInfoCompanyRegistrationRequestDto } from './dto/needs-more-info-company-registration-request.dto';
import { QueryCompanyRegistrationRequestsDto } from './dto/query-company-registration-requests.dto';
import { RejectCompanyRegistrationRequestDto } from './dto/reject-company-registration-request.dto';

type RegistrationAttemptWindow = {
  at: number;
};

@Injectable()
export class CompanyRegistrationService {
  private readonly rateLimitWindowMs = 15 * 60 * 1000;
  private readonly rateLimitMaxAttempts = 5;
  private readonly registrationAttempts = new Map<string, RegistrationAttemptWindow[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizePhone(value: string): string {
    const normalized = value.replace(/[^0-9+]/g, '').trim();
    if (!normalized) return value.trim();
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
  }

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  private checkRateLimit(key: string) {
    const now = Date.now();
    const entries = this.registrationAttempts.get(key) ?? [];
    const validEntries = entries.filter(
      (entry) => now - entry.at <= this.rateLimitWindowMs,
    );

    if (validEntries.length >= this.rateLimitMaxAttempts) {
      throw new BadRequestException(
        'Too many registration attempts. Please try again later.',
      );
    }

    validEntries.push({ at: now });
    this.registrationAttempts.set(key, validEntries);
  }

  private async assertEmailIsAvailable(email: string, allowRejectedRequest = true) {
    const [existingUser, existingCompany, existingRequest] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        select: { id: true },
      }),
      this.prisma.company.findFirst({
        where: {
          email: {
            equals: email,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        select: { id: true },
      }),
      this.prisma.companyRegistrationRequest.findFirst({
        where: {
          businessEmail: {
            equals: email,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      }),
    ]);

    if (existingUser) {
      throw new ConflictException('A user with this business email already exists.');
    }

    if (existingCompany) {
      throw new ConflictException('A company with this business email already exists.');
    }

    if (
      existingRequest &&
      (!allowRejectedRequest || existingRequest.status !== CompanyRegistrationStatus.REJECTED)
    ) {
      throw new ConflictException(
        `A registration request already exists with status ${existingRequest.status}.`,
      );
    }
  }

  private async createAuditLog(input: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    companyId?: string | null;
    details?: Record<string, unknown>;
  }) {
    await this.prisma.auditLog.create({
      data: {
        companyId: input.companyId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        details: (input.details ?? {}) as Prisma.InputJsonValue,
        ipAddress: null,
        createdAt: new Date(),
      },
    });
  }

  async createPublicRequest(
    dto: CreateCompanyRegistrationRequestDto,
    input: { requesterIp?: string | null },
  ) {
    const email = this.normalizeEmail(dto.businessEmail);
    const phone = this.normalizePhone(dto.phoneNumber);
    const requesterIp = input.requesterIp ?? 'unknown';
    this.checkRateLimit(`${requesterIp}:${email}`);
    await this.assertEmailIsAvailable(email, true);

    const request = await this.prisma.companyRegistrationRequest.create({
      data: {
        companyName: dto.companyName.trim(),
        businessEmail: email,
        phoneNumber: phone,
        responsibleFullName: dto.responsibleFullName.trim(),
        requestedRole:
          dto.requestedRole === UserRole.SUPER_ADMIN
            ? UserRole.COMPANY_ADMIN
            : dto.requestedRole ?? UserRole.COMPANY_ADMIN,
        businessType: dto.businessType.trim(),
        message: dto.message?.trim() || null,
        status: CompanyRegistrationStatus.PENDING_APPROVAL,
      },
    });

    const notification = await this.prisma.notification.create({
      data: {
        companyId: null,
        conversationId: null,
        contactId: null,
        type: NotificationType.COMPANY_REGISTRATION_REQUEST,
        title: 'New company registration request',
        message: 'A company wants to register on the platform',
        priority: NotificationPriority.high,
        isRead: false,
      },
    });
    await this.createAuditLog({
      action: 'CREATE_COMPANY_REGISTRATION_REQUEST',
      entityType: 'CompanyRegistrationRequest',
      entityId: request.id,
      details: {
        requesterIp,
        businessEmail: email,
        companyName: dto.companyName,
      },
    });

    return {
      success: true,
      data: {
        id: request.id,
        status: request.status,
        companyName: request.companyName,
        businessEmail: request.businessEmail,
        createdAt: request.createdAt,
        notificationId: notification.id,
      },
    };
  }

  async findRequests(query: QueryCompanyRegistrationRequestsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CompanyRegistrationRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              {
                companyName: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                businessEmail: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                responsibleFullName: {
                  contains: query.search.trim(),
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.companyRegistrationRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reviewedByUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          approvedCompany: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.companyRegistrationRequest.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findRequestById(id: string) {
    const request = await this.prisma.companyRegistrationRequest.findUnique({
      where: { id },
      include: {
        reviewedByUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        approvedCompany: {
          select: {
            id: true,
            name: true,
            status: true,
            isActive: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Registration request ${id} not found`);
    }

    return request;
  }

  async approveRequest(
    id: string,
    dto: ApproveCompanyRegistrationRequestDto,
    actor: AuthenticatedUser,
  ) {
    const registrationRequest = await this.findRequestById(id);

    if (
      registrationRequest.status !== CompanyRegistrationStatus.PENDING_APPROVAL &&
      registrationRequest.status !== CompanyRegistrationStatus.NEEDS_MORE_INFO
    ) {
      throw new BadRequestException(
        `Cannot approve a request with status ${registrationRequest.status}`,
      );
    }

    await this.assertEmailIsAvailable(
      this.normalizeEmail(registrationRequest.businessEmail),
      false,
    );

    const activationToken = randomBytes(24).toString('hex');
    const activationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const requestedStatus =
      (dto.companyStatus === CompanyStatus.ACTIVE ||
        dto.companyStatus === CompanyStatus.TRIAL)
        ? dto.companyStatus
        : CompanyStatus.TRIAL;
    const companyName = registrationRequest.companyName.trim();
    const normalizedEmail = this.normalizeEmail(registrationRequest.businessEmail);

    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          legalName: companyName,
          email: normalizedEmail,
          phone: registrationRequest.phoneNumber,
          status: requestedStatus,
          isActive: true,
        },
      });

      const temporaryPassword = randomBytes(16).toString('hex');
      const companyAdminUser = await tx.user.create({
        data: {
          companyId: company.id,
          fullName: registrationRequest.responsibleFullName,
          email: normalizedEmail,
          passwordHash: this.hashPassword(temporaryPassword),
          role: UserRole.COMPANY_ADMIN,
          isActive: false,
        },
      });

      const baseInstance = this.slugify(registrationRequest.companyName) || 'company';
      const evolutionInstanceName = `${baseInstance}_${registrationRequest.id.slice(0, 8)}`;
      await tx.companyWhatsappInstance.create({
        data: {
          companyId: company.id,
          evolutionInstanceName,
          whatsappNumber: null,
          connectionStatus: WhatsappConnectionStatus.DISCONNECTED,
        },
      });

      const updatedRequest = await tx.companyRegistrationRequest.update({
        where: { id: registrationRequest.id },
        data: {
          status: CompanyRegistrationStatus.APPROVED,
          rejectionReason: null,
          infoRequest: null,
          reviewedByUserId: actor.sub,
          reviewedAt: new Date(),
          approvedAt: new Date(),
          approvedCompanyId: company.id,
          activationToken,
          activationExpiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorUserId: actor.sub,
          action: 'APPROVE_COMPANY_REGISTRATION_REQUEST',
          entityType: 'CompanyRegistrationRequest',
          entityId: updatedRequest.id,
          details: {
            companyId: company.id,
            companyAdminUserId: companyAdminUser.id,
            companyStatus: requestedStatus,
          } as Prisma.InputJsonValue,
          createdAt: new Date(),
        },
      });

      return {
        request: updatedRequest,
        company,
        companyAdminUser,
        evolutionInstanceName,
      };
    });

    const frontendBase = (
      process.env.FRONTEND_URL ??
      process.env.ACTIVATION_BASE_URL ??
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    const activationLink = `${frontendBase}/activate?token=${encodeURIComponent(activationToken)}`;

    const emailSent = await this.mailService.sendInviteUserEmail({
      to: normalizedEmail,
      inviteLink: activationLink,
      invitedBy: 'Platform Super Admin',
      workspaceName: result.company.name,
    });

    return {
      success: true,
      request: result.request,
      company: result.company,
      companyAdminUserId: result.companyAdminUser.id,
      evolutionInstanceName: result.evolutionInstanceName,
      activationLink,
      activationEmailSent: emailSent,
      activationEmailError: emailSent ? null : this.mailService.getLastErrorMessage(),
    };
  }

  async rejectRequest(
    id: string,
    dto: RejectCompanyRegistrationRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findRequestById(id);

    if (request.status === CompanyRegistrationStatus.APPROVED) {
      throw new BadRequestException('Cannot reject an already approved request');
    }

    const updated = await this.prisma.companyRegistrationRequest.update({
      where: { id },
      data: {
        status: CompanyRegistrationStatus.REJECTED,
        rejectionReason: dto.rejectionReason?.trim() || null,
        reviewedByUserId: actor.sub,
        reviewedAt: new Date(),
      },
    });

    await this.createAuditLog({
      actorUserId: actor.sub,
      action: 'REJECT_COMPANY_REGISTRATION_REQUEST',
      entityType: 'CompanyRegistrationRequest',
      entityId: updated.id,
      details: {
        rejectionReason: updated.rejectionReason,
      },
    });

    return {
      success: true,
      request: updated,
    };
  }

  async requestMoreInfo(
    id: string,
    dto: NeedsMoreInfoCompanyRegistrationRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findRequestById(id);

    if (request.status === CompanyRegistrationStatus.APPROVED) {
      throw new BadRequestException(
        'Cannot move an approved request to NEEDS_MORE_INFO',
      );
    }

    const updated = await this.prisma.companyRegistrationRequest.update({
      where: { id },
      data: {
        status: CompanyRegistrationStatus.NEEDS_MORE_INFO,
        infoRequest: dto.infoRequest.trim(),
        reviewedByUserId: actor.sub,
        reviewedAt: new Date(),
      },
    });

    await this.createAuditLog({
      actorUserId: actor.sub,
      action: 'REQUEST_MORE_INFO_COMPANY_REGISTRATION_REQUEST',
      entityType: 'CompanyRegistrationRequest',
      entityId: updated.id,
      details: {
        infoRequest: updated.infoRequest,
      },
    });

    return {
      success: true,
      request: updated,
    };
  }
}
