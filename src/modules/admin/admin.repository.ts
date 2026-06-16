import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  AgentRegistrationStatus,
  Prisma,
  SubscriptionStatus,
  UserApprovalStatus,
  UserRole,
} from '../../generated/prisma/client';

type PaginationInput = {
  page: number;
  limit: number;
};

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  private splitFullName(fullName: string | null): {
    firstName: string;
    lastName: string | null;
  } {
    const parts = (fullName ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 0) {
      return {
        firstName: '',
        lastName: null,
      };
    }

    return {
      firstName: parts[0],
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
  }

  private toUserView(user: {
    id: string;
    fullName: string | null;
    email: string;
    role: UserRole;
    isActive: boolean;
    companyId: string | null;
    createdAt: Date;
    updatedAt: Date;
    company?: {
      id: string;
      name: string;
      status: string;
      isActive: boolean;
    } | null;
  }) {
    const names = this.splitFullName(user.fullName);

    return {
      id: user.id,
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: user.fullName ?? [names.firstName, names.lastName].filter(Boolean).join(' '),
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      companyId: user.companyId,
      company: user.company ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async createCompany(data: Prisma.CompanyCreateInput) {
    return this.prisma.company.create({
      data,
      include: {
        _count: {
          select: {
            users: true,
            subscriptions: true,
          },
        },
      },
    });
  }

  async findCompanies(where: Prisma.CompanyWhereInput, pagination: PaginationInput) {
    const skip = (pagination.page - 1) * pagination.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: true,
              subscriptions: true,
            },
          },
        },
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit) || 1,
      },
    };
  }

  async findCompanyById(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            subscriptions: true,
          },
        },
      },
    });
  }

  async updateCompany(id: string, data: Prisma.CompanyUpdateInput) {
    return this.prisma.company.update({
      where: { id },
      data,
      include: {
        _count: {
          select: {
            users: true,
            subscriptions: true,
          },
        },
      },
    });
  }

  async activateCompanyAdmins(companyId: string) {
    return this.prisma.user.updateMany({
      where: {
        companyId,
        role: UserRole.COMPANY_ADMIN,
      },
      data: {
        isActive: true,
        approvalStatus: UserApprovalStatus.APPROVED,
      },
    });
  }

  async removeCompany(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.companyRegistrationRequest.updateMany({
        where: { approvedCompanyId: id },
        data: { approvedCompanyId: null },
      });

      await tx.subscription.deleteMany({ where: { companyId: id } });
      await tx.companyWhatsappInstance.deleteMany({ where: { companyId: id } });

      await tx.user.deleteMany({ where: { companyId: id } });
      await tx.contact.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.contactNote.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.conversation.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.conversationTag.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.message.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.aiRun.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.auditLog.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.kbChunk.deleteMany({
        where: {
          OR: [{ companyId: id }, { article: { companyId: id } }],
        },
      });
      await tx.kbArticle.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.kbSuggestion.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.setting.deleteMany({ where: { companyId: id } });
      await tx.webhookEvent.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });
      await tx.notification.updateMany({
        where: { companyId: id },
        data: { companyId: null },
      });

      return tx.company.delete({ where: { id } });
    });
  }

  async createSubscription(data: Prisma.SubscriptionUncheckedCreateInput) {
    return this.prisma.subscription.create({
      data,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            isActive: true,
          },
        },
      },
    });
  }

  async findSubscriptions(
    where: Prisma.SubscriptionWhereInput,
    pagination: PaginationInput,
  ) {
    const skip = (pagination.page - 1) * pagination.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: pagination.limit,
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
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit) || 1,
      },
    };
  }

  async findSubscriptionById(id: string) {
    return this.prisma.subscription.findUnique({
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
      },
    });
  }

  async updateSubscription(id: string, data: Prisma.SubscriptionUpdateInput) {
    return this.prisma.subscription.update({
      where: { id },
      data,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            isActive: true,
          },
        },
      },
    });
  }

  async removeSubscription(id: string) {
    return this.prisma.subscription.delete({ where: { id } });
  }

  async createUser(data: Prisma.UserUncheckedCreateInput) {
    const user = await this.prisma.user.create({
      data,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            status: true,
            isActive: true,
          },
        },
      },
    });

    return this.toUserView(user);
  }

  async findUsers(where: Prisma.UserWhereInput, pagination: PaginationInput) {
    const skip = (pagination.page - 1) * pagination.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: pagination.limit,
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
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map((user) => this.toUserView(user)),
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit) || 1,
      },
    };
  }

  async findUserById(id: string) {
    const user = await this.prisma.user.findUnique({
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
      },
    });

    return user ? this.toUserView(user) : null;
  }

  async updateUser(
    id: string,
    data: Prisma.UserUpdateInput,
    reviewedByUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              status: true,
              isActive: true,
            },
          },
        },
      });

      if (
        reviewedByUserId &&
        user.isActive &&
        user.role === UserRole.AGENT &&
        user.companyId
      ) {
        const pendingRequest = await tx.agentRegistrationRequest.findFirst({
          where: {
            userId: user.id,
            companyId: user.companyId,
            status: AgentRegistrationStatus.PENDING,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        if (pendingRequest) {
          const reviewedAt = new Date();

          await tx.agentRegistrationRequest.update({
            where: { id: pendingRequest.id },
            data: {
              status: AgentRegistrationStatus.APPROVED,
              rejectionReason: null,
              reviewedByUserId,
              reviewedAt,
              approvedAt: reviewedAt,
              approvedUserId: user.id,
            },
          });
        }
      }

      return this.toUserView(user);
    });
  }

  async removeUser(id: string) {
    const user = await this.prisma.user.delete({
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
      },
    });

    return this.toUserView(user);
  }

  async findCompanySummaryById(id: string) {
    return this.prisma.company.findUnique({ where: { id } });
  }

  async createAuditLog(data: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        actorUserId: data.actorUserId ?? null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        details: (data.details ?? {}) as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });
  }

  async findAuditLogs(where: Prisma.AuditLogWhereInput, pagination: PaginationInput) {
    const skip = (pagination.page - 1) * pagination.limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit) || 1,
      },
    };
  }

  async getPlatformSettings(key: string) {
    return this.prisma.setting.findUnique({ where: { key } });
  }

  async upsertPlatformSettings(
    key: string,
    value: Record<string, unknown>,
    updatedBy: string,
  ) {
    const now = new Date();

    return this.prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        description: 'Global platform settings for super admin',
        updatedBy,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        updatedBy,
        updatedAt: now,
      },
    });
  }

  async getDashboardStats() {
    const now = new Date();

    const [
      totalCompanies,
      activeCompanies,
      inactiveCompanies,
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalSubscriptions,
      activeSubscriptions,
      suspendedSubscriptions,
      expiredSubscriptions,
      canceledSubscriptions,
    ] = await this.prisma.$transaction([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { isActive: true } }),
      this.prisma.company.count({ where: { isActive: false } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.subscription.count(),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          isActive: true,
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.SUSPENDED,
        },
      }),
      this.prisma.subscription.count({
        where: {
          OR: [
            { status: SubscriptionStatus.EXPIRED },
            {
              status: SubscriptionStatus.ACTIVE,
              endDate: { lt: now },
            },
          ],
        },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.CANCELED,
        },
      }),
    ]);

    return {
      companies: {
        total: totalCompanies,
        active: activeCompanies,
        inactive: inactiveCompanies,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: inactiveUsers,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        suspended: suspendedSubscriptions,
        expired: expiredSubscriptions,
        canceled: canceledSubscriptions,
      },
    };
  }

  async checkDatabaseHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        connected: true,
      };
    } catch {
      return {
        connected: false,
      };
    }
  }
}
