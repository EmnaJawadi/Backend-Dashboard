import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { hashPassword } from '../../common/utils/password.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationsGateway } from '../../gateways/notifications.gateway';
import {
  AgentRegistrationStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  UserApprovalStatus,
  UserRole,
} from '../../generated/prisma/client';
import { CreateAgentRegistrationRequestDto } from './dto/create-agent-registration-request.dto';
import { QueryAgentRegistrationRequestsDto } from './dto/query-agent-registration-requests.dto';
import { RejectAgentRegistrationRequestDto } from './dto/reject-agent-registration-request.dto';

@Injectable()
export class AgentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  private normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  private buildFullName(dto: CreateAgentRegistrationRequestDto): string {
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();

    if (!firstName) {
      throw new BadRequestException('Le prenom est obligatoire.');
    }

    if (!lastName) {
      throw new BadRequestException('Le nom est obligatoire.');
    }

    return [firstName, lastName].join(' ');
  }

  private async findCompanyByNameOrThrow(companyName: string) {
    const normalizedCompanyName = companyName.trim();

    const company = await this.prisma.company.findFirst({
      where: {
        name: {
          equals: normalizedCompanyName,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        isActive: true,
      },
    });

    if (!company) {
      throw new BadRequestException(
        'Entreprise introuvable. Verifiez le nom de l entreprise ou contactez le super administrateur.',
      );
    }

    return company;
  }

  private async assertEmailCanRequest(email: string) {
    const [existingUser, latestRequest] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        select: {
          id: true,
          isActive: true,
          role: true,
          approvalStatus: true,
        },
      }),
      this.prisma.agentRegistrationRequest.findFirst({
        where: {
          email: {
            equals: email,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
        },
      }),
    ]);

    if (existingUser) {
      throw new ConflictException('Un compte existe deja avec cet email.');
    }

    if (
      latestRequest &&
      latestRequest.status !== AgentRegistrationStatus.REJECTED
    ) {
      throw new ConflictException(
        `Une demande agent existe deja avec le statut ${latestRequest.status}.`,
      );
    }
  }

  async createPublicRequest(dto: CreateAgentRegistrationRequestDto) {
    const fullName = this.buildFullName(dto);
    const email = this.normalizeEmail(dto.email);
    const companyName = dto.companyName.trim();

    if (!companyName) {
      throw new BadRequestException('Le nom de l entreprise est obligatoire.');
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Les mots de passe ne correspondent pas.');
    }

    await this.assertEmailCanRequest(email);
    const company = await this.findCompanyByNameOrThrow(companyName);
    const passwordHash = await hashPassword(dto.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          companyId: company.id,
          fullName,
          email,
          passwordHash,
          role: UserRole.AGENT,
          isActive: false,
          approvalStatus: UserApprovalStatus.PENDING,
        },
      });

      const request = await tx.agentRegistrationRequest.create({
        data: {
          companyId: company.id,
          userId: user.id,
          fullName,
          email,
          passwordHash,
          status: AgentRegistrationStatus.PENDING,
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              isActive: true,
              approvalStatus: true,
              companyId: true,
            },
          },
        },
      });

      const notification = await tx.notification.create({
        data: {
          companyId: null,
          conversationId: null,
          contactId: null,
          type: NotificationType.AGENT_REGISTRATION_REQUEST,
          title: 'Nouvelle demande agent humain',
          message: `Nouvelle demande d'autorisation : un agent humain souhaite rejoindre l'entreprise ${company.name}.`,
          priority: NotificationPriority.high,
          isRead: false,
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorUserId: null,
          action: 'CREATE_AGENT_REGISTRATION_REQUEST',
          entityType: 'AgentRegistrationRequest',
          entityId: request.id,
          details: {
            companyId: company.id,
            companyName: company.name,
            agentUserId: user.id,
            email,
          } as Prisma.InputJsonValue,
          ipAddress: null,
          createdAt: new Date(),
        },
      });

      return { request, notification, user };
    });

    this.notificationsGateway.emitSystemNotification({
      event: 'agent_registration_request_created',
      notification: result.notification,
      request: {
        id: result.request.id,
        companyId: result.request.companyId,
        companyName: result.request.company.name,
        fullName: result.request.fullName,
        email: result.request.email,
        status: result.request.status,
        createdAt: result.request.createdAt,
      },
    });

    return {
      success: true,
      message:
        "Votre demande a ete envoyee. Vous pourrez vous connecter apres l'autorisation du super administrateur.",
      data: {
        id: result.request.id,
        status: result.request.status,
        companyId: result.request.companyId,
        companyName: result.request.company.name,
        email: result.request.email,
        createdAt: result.request.createdAt,
        notificationId: result.notification.id,
        user: {
          id: result.user.id,
          isActive: result.user.isActive,
          approvalStatus: result.user.approvalStatus,
        },
      },
    };
  }

  async findRequests(query: QueryAgentRegistrationRequestsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const search = query.search?.trim();
    const where: Prisma.AgentRegistrationRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              {
                fullName: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                email: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                company: {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.agentRegistrationRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              status: true,
              isActive: true,
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              isActive: true,
              approvalStatus: true,
              companyId: true,
            },
          },
          reviewedByUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          approvedUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
              isActive: true,
              approvalStatus: true,
            },
          },
        },
      }),
      this.prisma.agentRegistrationRequest.count({ where }),
    ]);

    return {
      items: items.map(({ passwordHash: _passwordHash, ...item }) => item),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findRequestById(id: string) {
    const request = await this.prisma.agentRegistrationRequest.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            isActive: true,
          },
        },
        user: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Agent registration request ${id} not found`);
    }

    return request;
  }

  async approveRequest(id: string, actor: AuthenticatedUser) {
    const request = await this.findRequestById(id);

    if (request.status !== AgentRegistrationStatus.PENDING) {
      throw new BadRequestException(
        `Cannot approve a request with status ${request.status}`,
      );
    }

    const normalizedEmail = this.normalizeEmail(request.email);

    const result = await this.prisma.$transaction(async (tx) => {
      const existingUser = request.userId
        ? await tx.user.findUnique({ where: { id: request.userId } })
        : await tx.user.findFirst({
            where: {
              email: {
                equals: normalizedEmail,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          });

      if (existingUser?.role === UserRole.SUPER_ADMIN) {
        throw new ConflictException(
          'Cet email est reserve a l administration plateforme.',
        );
      }

      if (existingUser?.role === UserRole.COMPANY_ADMIN) {
        throw new ConflictException(
          'Cet email est deja rattache a un administrateur entreprise.',
        );
      }

      const isLinkedApprovedAgent =
        existingUser?.id === request.userId &&
        existingUser.role === UserRole.AGENT;

      if (
        existingUser?.isActive &&
        existingUser.approvalStatus === UserApprovalStatus.APPROVED &&
        !isLinkedApprovedAgent
      ) {
        throw new ConflictException('Un compte actif existe deja avec cet email.');
      }

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              companyId: request.companyId,
              fullName: request.fullName,
              email: normalizedEmail,
              passwordHash: request.passwordHash,
              role: UserRole.AGENT,
              isActive: true,
              approvalStatus: UserApprovalStatus.APPROVED,
            },
          })
        : await tx.user.create({
            data: {
              companyId: request.companyId,
              fullName: request.fullName,
              email: normalizedEmail,
              passwordHash: request.passwordHash,
              role: UserRole.AGENT,
              isActive: true,
              approvalStatus: UserApprovalStatus.APPROVED,
            },
          });

      const updatedRequest = await tx.agentRegistrationRequest.update({
        where: { id: request.id },
        data: {
          status: AgentRegistrationStatus.APPROVED,
          rejectionReason: null,
          reviewedByUserId: actor.sub,
          reviewedAt: new Date(),
          approvedAt: new Date(),
          approvedUserId: user.id,
          userId: user.id,
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              status: true,
              isActive: true,
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              isActive: true,
              approvalStatus: true,
              companyId: true,
            },
          },
          approvedUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
              isActive: true,
              approvalStatus: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: request.companyId,
          actorUserId: actor.sub,
          action: 'APPROVE_AGENT_REGISTRATION_REQUEST',
          entityType: 'AgentRegistrationRequest',
          entityId: request.id,
          details: {
            companyId: request.companyId,
            agentUserId: user.id,
          } as Prisma.InputJsonValue,
          ipAddress: null,
          createdAt: new Date(),
        },
      });

      return { request: updatedRequest, user };
    });

    const { passwordHash: _passwordHash, ...requestWithoutPassword } =
      result.request;

    return {
      success: true,
      request: requestWithoutPassword,
      user: {
        id: result.user.id,
        fullName: result.user.fullName,
        email: result.user.email,
        role: result.user.role,
        companyId: result.user.companyId,
        isActive: result.user.isActive,
        approvalStatus: result.user.approvalStatus,
      },
    };
  }

  async rejectRequest(
    id: string,
    dto: RejectAgentRegistrationRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findRequestById(id);

    if (request.status === AgentRegistrationStatus.APPROVED) {
      throw new BadRequestException('Cannot reject an already approved request');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (request.userId) {
        await tx.user.update({
          where: { id: request.userId },
          data: {
            isActive: false,
            approvalStatus: UserApprovalStatus.REJECTED,
          },
        });
      } else {
        await tx.user.updateMany({
          where: {
            email: {
              equals: this.normalizeEmail(request.email),
              mode: Prisma.QueryMode.insensitive,
            },
            role: UserRole.AGENT,
          },
          data: {
            isActive: false,
            approvalStatus: UserApprovalStatus.REJECTED,
          },
        });
      }

      const rejected = await tx.agentRegistrationRequest.update({
        where: { id },
        data: {
          status: AgentRegistrationStatus.REJECTED,
          rejectionReason: dto.rejectionReason?.trim() || null,
          reviewedByUserId: actor.sub,
          reviewedAt: new Date(),
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              status: true,
              isActive: true,
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
              isActive: true,
              approvalStatus: true,
              companyId: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: request.companyId,
          actorUserId: actor.sub,
          action: 'REJECT_AGENT_REGISTRATION_REQUEST',
          entityType: 'AgentRegistrationRequest',
          entityId: request.id,
          details: {
            rejectionReason: rejected.rejectionReason,
          } as Prisma.InputJsonValue,
          ipAddress: null,
          createdAt: new Date(),
        },
      });

      return rejected;
    });

    const { passwordHash: _passwordHash, ...requestWithoutPassword } = updated;

    return {
      success: true,
      request: requestWithoutPassword,
    };
  }
}
