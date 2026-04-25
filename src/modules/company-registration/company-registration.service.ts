import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../../common/utils/password.util';
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

  constructor(private readonly prisma: PrismaService) {}

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

  private async assertEmailIsAvailable(email: string, allowRejectedRequest = true) {
    const [existingUser, existingRequest] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        select: { id: true, role: true },
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
      if (existingUser.role === UserRole.SUPER_ADMIN) {
        throw new ConflictException(
          'This email is reserved for platform administration.',
        );
      }

      throw new ConflictException(
        'A user with this business email already exists.',
      );
    }

    if (
      existingRequest &&
      (!allowRejectedRequest ||
        (existingRequest.status !== CompanyRegistrationStatus.REJECTED &&
          existingRequest.status !== CompanyRegistrationStatus.APPROVED))
    ) {
      throw new ConflictException(
        `A registration request already exists with status ${existingRequest.status}.`,
      );
    }
  }

  private async findLinkableCompany(input: {
    companyName: string;
    businessEmail: string;
  }) {
    const [companyByName, companyByEmail] = await Promise.all([
      this.prisma.company.findFirst({
        where: {
          name: {
            equals: input.companyName,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        select: {
          id: true,
          name: true,
          legalName: true,
          email: true,
          phone: true,
          status: true,
          isActive: true,
        },
      }),
      this.prisma.company.findFirst({
        where: {
          email: {
            equals: input.businessEmail,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        select: {
          id: true,
          name: true,
          legalName: true,
          email: true,
          phone: true,
          status: true,
          isActive: true,
        },
      }),
    ]);

    if (companyByName && companyByEmail && companyByName.id !== companyByEmail.id) {
      throw new ConflictException(
        'A different company already uses this business email.',
      );
    }

    return companyByName ?? companyByEmail ?? null;
  }

  async createPublicRequest(
    dto: CreateCompanyRegistrationRequestDto,
    input: { requesterIp?: string | null },
  ) {
    const normalizedEmail = this.normalizeEmail(dto.businessEmail);
    const normalizedPhone = this.normalizePhone(dto.phoneNumber);
    const companyName = dto.companyName.trim();
    const responsibleFullName = dto.responsibleFullName.trim();

    if (dto.requestedRole === UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        'SUPER_ADMIN cannot be requested from public registration.',
      );
    }

    const requesterIp = input.requesterIp ?? 'unknown';
    this.checkRateLimit(`${requesterIp}:${normalizedEmail}`);
    await this.assertEmailIsAvailable(normalizedEmail, true);

    const existingCompany = await this.findLinkableCompany({
      companyName,
      businessEmail: normalizedEmail,
    });

    if (existingCompany?.isActive) {
      throw new ConflictException(
        'This company is already active. Please contact platform administration.',
      );
    }

    const hashedPassword = await hashPassword(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const linkedCompany = existingCompany
        ? await tx.company.update({
            where: { id: existingCompany.id },
            data: {
              name: companyName,
              legalName: existingCompany.legalName ?? companyName,
              phone: normalizedPhone,
              status: CompanyStatus.PENDING,
              isActive: false,
              ...(existingCompany.email &&
              existingCompany.email.toLowerCase() !== normalizedEmail
                ? {}
                : { email: normalizedEmail }),
            },
          })
        : await tx.company.create({
            data: {
              name: companyName,
              legalName: companyName,
              email: normalizedEmail,
              phone: normalizedPhone,
              status: CompanyStatus.PENDING,
              isActive: false,
            },
          });

      const user = await tx.user.create({
        data: {
          companyId: linkedCompany.id,
          fullName: responsibleFullName,
          email: normalizedEmail,
          passwordHash: hashedPassword,
          role: UserRole.COMPANY_ADMIN,
          isActive: false,
        },
      });

      const request = await tx.companyRegistrationRequest.create({
        data: {
          companyName,
          businessEmail: normalizedEmail,
          phoneNumber: normalizedPhone,
          responsibleFullName,
          requestedRole: UserRole.COMPANY_ADMIN,
          businessType: dto.businessType.trim(),
          message: dto.message?.trim() || null,
          status: CompanyRegistrationStatus.PENDING_APPROVAL,
        },
      });

      const notification = await tx.notification.create({
        data: {
          companyId: null,
          conversationId: null,
          contactId: null,
          type: NotificationType.COMPANY_REGISTRATION_REQUEST,
          title: 'Nouvelle demande d inscription entreprise',
          message: `Nouvelle demande d inscription entreprise : ${companyName} par ${responsibleFullName}`,
          priority: NotificationPriority.high,
          isRead: false,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: linkedCompany.id,
          actorUserId: null,
          action: 'CREATE_COMPANY_REGISTRATION_REQUEST',
          entityType: 'CompanyRegistrationRequest',
          entityId: request.id,
          details: {
            requesterIp,
            businessEmail: normalizedEmail,
            companyName,
            companyId: linkedCompany.id,
            companyAdminUserId: user.id,
          } as Prisma.InputJsonValue,
          ipAddress: null,
          createdAt: new Date(),
        },
      });

      return {
        company: linkedCompany,
        user,
        request,
        notification,
      };
    });

    return {
      success: true,
      data: {
        id: result.request.id,
        status: result.request.status,
        companyName: result.request.companyName,
        businessEmail: result.request.businessEmail,
        createdAt: result.request.createdAt,
        notificationId: result.notification.id,
        companyId: result.company.id,
        companyAdminUserId: result.user.id,
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

    const normalizedEmail = this.normalizeEmail(registrationRequest.businessEmail);
    const requestedStatus =
      dto.companyStatus === CompanyStatus.ACTIVE ||
      dto.companyStatus === CompanyStatus.TRIAL
        ? dto.companyStatus
        : CompanyStatus.ACTIVE;

    const result = await this.prisma.$transaction(async (tx) => {
      const companyAdminUser = await tx.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      });

      const fallbackCompany =
        companyAdminUser?.companyId
          ? await tx.company.findUnique({ where: { id: companyAdminUser.companyId } })
          : await tx.company.findFirst({
              where: {
                OR: [
                  {
                    name: {
                      equals: registrationRequest.companyName,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    email: {
                      equals: normalizedEmail,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                ],
              },
            });

      const company = fallbackCompany
        ? await tx.company.update({
            where: { id: fallbackCompany.id },
            data: {
              name: registrationRequest.companyName,
              legalName: fallbackCompany.legalName ?? registrationRequest.companyName,
              email: normalizedEmail,
              phone: registrationRequest.phoneNumber,
              status: requestedStatus,
              isActive: true,
            },
          })
        : await tx.company.create({
            data: {
              name: registrationRequest.companyName,
              legalName: registrationRequest.companyName,
              email: normalizedEmail,
              phone: registrationRequest.phoneNumber,
              status: requestedStatus,
              isActive: true,
            },
          });

      const approvedUser = companyAdminUser
        ? await tx.user.update({
            where: { id: companyAdminUser.id },
            data: {
              companyId: company.id,
              fullName: registrationRequest.responsibleFullName,
              role: UserRole.COMPANY_ADMIN,
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              companyId: company.id,
              fullName: registrationRequest.responsibleFullName,
              email: normalizedEmail,
              passwordHash: await hashPassword(randomBytes(16).toString('hex')),
              role: UserRole.COMPANY_ADMIN,
              isActive: true,
            },
          });

      const existingInstance = await tx.companyWhatsappInstance.findFirst({
        where: { companyId: company.id },
        select: { id: true },
      });

      let evolutionInstanceName: string | null = null;
      if (!existingInstance) {
        const baseInstance = this.slugify(registrationRequest.companyName) || 'company';
        evolutionInstanceName = `${baseInstance}_${registrationRequest.id.slice(0, 8)}`;
        await tx.companyWhatsappInstance.create({
          data: {
            companyId: company.id,
            evolutionInstanceName,
            whatsappNumber: null,
            connectionStatus: WhatsappConnectionStatus.DISCONNECTED,
          },
        });
      }

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
          activationToken: null,
          activationExpiresAt: null,
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
            companyAdminUserId: approvedUser.id,
            companyStatus: requestedStatus,
          } as Prisma.InputJsonValue,
          createdAt: new Date(),
        },
      });

      return {
        request: updatedRequest,
        company,
        companyAdminUserId: approvedUser.id,
        evolutionInstanceName,
      };
    });

    return {
      success: true,
      request: result.request,
      company: result.company,
      companyAdminUserId: result.companyAdminUserId,
      evolutionInstanceName: result.evolutionInstanceName,
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

    const normalizedEmail = this.normalizeEmail(request.businessEmail);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedRequest = await tx.companyRegistrationRequest.update({
        where: { id },
        data: {
          status: CompanyRegistrationStatus.REJECTED,
          rejectionReason: dto.rejectionReason?.trim() || null,
          reviewedByUserId: actor.sub,
          reviewedAt: new Date(),
        },
      });

      await tx.user.updateMany({
        where: {
          email: {
            equals: normalizedEmail,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        data: {
          isActive: false,
        },
      });

      const company = await tx.company.findFirst({
        where: {
          OR: [
            {
              name: {
                equals: request.companyName,
                mode: Prisma.QueryMode.insensitive,
              },
            },
            {
              email: {
                equals: normalizedEmail,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ],
        },
        select: {
          id: true,
        },
      });

      if (company) {
        await tx.company.update({
          where: { id: company.id },
          data: {
            status: CompanyStatus.SUSPENDED,
            isActive: false,
          },
        });
      }

      return updatedRequest;
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
