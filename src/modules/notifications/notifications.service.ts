import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  NotificationPriority,
  NotificationType,
  Prisma,
  UserRole,
} from '../../generated/prisma/client';
import { NotificationsGateway } from '../../gateways/notifications.gateway';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotifyAdminDto } from './dto/notify-admin.dto';
import { NotifyAgentAssignedDto } from './dto/notify-agent-assigned.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async create(
    dto: CreateNotificationDto,
    actor?: AuthenticatedUser,
  ) {
    const created = await this.prisma.notification.create({
      data: {
        companyId: dto.companyId ?? null,
        conversationId: dto.conversationId ?? null,
        contactId: dto.contactId ?? null,
        readByUserId: null,
        type: dto.type,
        title: dto.title.trim(),
        message: dto.message.trim(),
        priority: dto.priority ?? NotificationPriority.medium,
        isRead: dto.isRead ?? false,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        companyId: created.companyId ?? null,
        actorUserId: actor?.sub ?? null,
        action: 'CREATE_NOTIFICATION',
        entityType: 'Notification',
        entityId: created.id,
        details: {
          type: created.type,
          priority: created.priority,
        } as Prisma.InputJsonValue,
        createdAt: new Date(),
      },
    });

    this.notificationsGateway.emitSystemNotification({
      event: 'notification_created',
      notification: created,
    });

    return created;
  }

  async findAll(query: QueryNotificationsDto, actor?: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const actorCompanyScope =
      actor && actor.role !== UserRole.SUPER_ADMIN ? actor.companyId : undefined;

    const where: Prisma.NotificationWhereInput = {
      ...(actorCompanyScope ? { companyId: actorCompanyScope } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.isRead !== undefined ? { isRead: query.isRead === 'true' } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
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

  async markAsRead(id: string, actor?: AuthenticatedUser) {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    if (
      actor &&
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.companyId &&
      existing.companyId &&
      actor.companyId !== existing.companyId
    ) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
        readByUserId: actor?.sub ?? null,
      },
    });

    this.notificationsGateway.emitSystemNotification({
      event: 'notification_read',
      notificationId: updated.id,
    });

    return updated;
  }

  async notifyAgentAssigned(payload: NotifyAgentAssignedDto) {
    return this.create({
      companyId: null,
      conversationId: payload.conversationId ?? null,
      contactId: null,
      type: NotificationType.HANDOFF_REQUIRED,
      title: 'Conversation requires human handoff',
      message:
        payload.reason ??
        'A conversation has been assigned to a human agent or bot is paused.',
      priority: NotificationPriority.high,
      isRead: false,
    });
  }

  async notifyAdmin(payload: NotifyAdminDto) {
    const type = this.resolveLegacyType(payload.type);
    return this.create({
      companyId: null,
      conversationId: payload.conversationId ?? null,
      contactId: null,
      type,
      title: 'Platform notification',
      message:
        payload.message ??
        'An important event requires review by platform administrators.',
      priority: NotificationPriority.high,
      isRead: false,
    });
  }

  private resolveLegacyType(value?: string): NotificationType {
    const normalized = value?.trim().toUpperCase();

    if (!normalized) {
      return NotificationType.IMPORTANT_VALIDATION;
    }

    if (normalized in NotificationType) {
      return NotificationType[normalized as keyof typeof NotificationType];
    }

    if (normalized.includes('HANDOFF')) {
      return NotificationType.HANDOFF_REQUIRED;
    }

    if (normalized.includes('HUMAN')) {
      return NotificationType.CUSTOMER_REQUEST_HUMAN;
    }

    if (normalized.includes('KB')) {
      return NotificationType.KB_DRAFT_SUGGESTION;
    }

    return NotificationType.IMPORTANT_VALIDATION;
  }
}
