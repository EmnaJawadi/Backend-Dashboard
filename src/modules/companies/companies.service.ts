import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CompanyStatus,
  NotificationPriority,
  NotificationType,
  Prisma,
  UserRole,
  WhatsappConnectionStatus,
} from '../../generated/prisma/client';
import { EvolutionApiClient } from '../../integrations/whatsapp/evolution-api.client';
import { ConnectCompanyWhatsappDto } from './dto/connect-company-whatsapp.dto';
import { CreateCompanyApiDto } from './dto/create-company-api.dto';
import { UpdateCompanyApiDto } from './dto/update-company-api.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionApiClient: EvolutionApiClient,
  ) {}

  private ensureCompanyScope(actor: AuthenticatedUser, companyId: string) {
    if (actor.role === UserRole.SUPER_ADMIN) {
      return;
    }

    if (!actor.companyId || actor.companyId !== companyId) {
      throw new ForbiddenException('You can only access your company.');
    }
  }

  private normalizeInstanceName(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  private normalizeWhatsappNumber(value?: string | null) {
    const raw = value?.trim();
    if (!raw) return null;

    const normalized = raw.replace(/[^0-9+]/g, '');
    if (!normalized) return null;
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  private parseConnectionStatus(payload: Record<string, unknown>): WhatsappConnectionStatus {
    const toText = (value: unknown): string =>
      typeof value === 'string' ? value.toLowerCase().trim() : '';

    const candidates = [
      toText(payload.state),
      toText(payload.status),
      toText(payload.connectionStatus),
      toText((payload.data as Record<string, unknown> | undefined)?.state),
      toText((payload.data as Record<string, unknown> | undefined)?.status),
      toText((payload.instance as Record<string, unknown> | undefined)?.state),
    ];

    if (candidates.some((candidate) => candidate.includes('open') || candidate.includes('connected'))) {
      return WhatsappConnectionStatus.CONNECTED;
    }

    if (candidates.some((candidate) => candidate.includes('qr') || candidate.includes('scan'))) {
      return WhatsappConnectionStatus.QR_READY;
    }

    if (candidates.some((candidate) => candidate.includes('connect'))) {
      return WhatsappConnectionStatus.CONNECTING;
    }

    if (candidates.some((candidate) => candidate.includes('error') || candidate.includes('fail'))) {
      return WhatsappConnectionStatus.ERROR;
    }

    return WhatsappConnectionStatus.DISCONNECTED;
  }

  private extractQrCode(payload: Record<string, unknown>): string | null {
    const scan = (value: unknown): string | null => {
      if (typeof value === 'string' && value.trim()) {
        const trimmed = value.trim();
        if (
          trimmed.startsWith('data:image/') ||
          trimmed.startsWith('http') ||
          trimmed.length > 120
        ) {
          return trimmed;
        }
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const qr = scan(item);
          if (qr) return qr;
        }
      }

      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const candidates = [
          record.qrcode,
          record.qr,
          record.base64,
          record.code,
          record.qrCode,
        ];

        for (const candidate of candidates) {
          const qr = scan(candidate);
          if (qr) return qr;
        }

        for (const nested of Object.values(record)) {
          const qr = scan(nested);
          if (qr) return qr;
        }
      }

      return null;
    };

    return scan(payload);
  }

  private async getCompanyOrFail(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    return company;
  }

  async create(dto: CreateCompanyApiDto) {
    return this.prisma.company.create({
      data: {
        name: dto.name.trim(),
        legalName: dto.legalName?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        website: dto.website?.trim() || null,
        address: dto.address?.trim() || null,
        status: dto.status ?? CompanyStatus.PENDING,
        isActive:
          dto.status === CompanyStatus.ACTIVE ||
          dto.status === CompanyStatus.TRIAL,
      },
    });
  }

  async findAll(actor: AuthenticatedUser) {
    if (actor.role === UserRole.SUPER_ADMIN) {
      return this.prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          whatsappInstances: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
        },
      });
    }

    if (!actor.companyId) {
      return [];
    }

    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      include: {
        whatsappInstances: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
      },
    });

    return company ? [company] : [];
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    this.ensureCompanyScope(actor, id);
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        whatsappInstances: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    return company;
  }

  async update(id: string, dto: UpdateCompanyApiDto, actor: AuthenticatedUser) {
    this.ensureCompanyScope(actor, id);
    await this.getCompanyOrFail(id);

    if (dto.status && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can change company status');
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.legalName !== undefined ? { legalName: dto.legalName?.trim() || null } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.website !== undefined ? { website: dto.website?.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
        ...(dto.status !== undefined
          ? {
              status: dto.status,
              isActive:
                dto.status === CompanyStatus.ACTIVE ||
                dto.status === CompanyStatus.TRIAL,
            }
          : {}),
      },
    });
  }

  private async upsertCompanyWhatsappMapping(input: {
    companyId: string;
    requestedInstanceName?: string;
    requestedWhatsappNumber?: string;
  }) {
    const existing = await this.prisma.companyWhatsappInstance.findFirst({
      where: { companyId: input.companyId },
      orderBy: { updatedAt: 'desc' },
    });

    const normalizedRequestedNumber = this.normalizeWhatsappNumber(
      input.requestedWhatsappNumber,
    );

    if (existing) {
      return this.prisma.companyWhatsappInstance.update({
        where: { id: existing.id },
        data: {
          ...(input.requestedInstanceName
            ? { evolutionInstanceName: this.normalizeInstanceName(input.requestedInstanceName) }
            : {}),
          ...(normalizedRequestedNumber
            ? { whatsappNumber: normalizedRequestedNumber }
            : {}),
          updatedAt: new Date(),
        },
      });
    }

    const computedInstanceName = this.normalizeInstanceName(
      input.requestedInstanceName ||
        `${input.companyId.slice(0, 8)}_${Date.now().toString(36)}`,
    );

    return this.prisma.companyWhatsappInstance.create({
      data: {
        companyId: input.companyId,
        evolutionInstanceName: computedInstanceName,
        whatsappNumber: normalizedRequestedNumber,
        connectionStatus: WhatsappConnectionStatus.DISCONNECTED,
      },
    });
  }

  async connectWhatsapp(
    companyId: string,
    dto: ConnectCompanyWhatsappDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureCompanyScope(actor, companyId);
    await this.getCompanyOrFail(companyId);

    const mapping = await this.upsertCompanyWhatsappMapping({
      companyId,
      requestedInstanceName: dto.evolutionInstanceName,
      requestedWhatsappNumber: dto.whatsappNumber,
    });

    await this.prisma.companyWhatsappInstance.update({
      where: { id: mapping.id },
      data: {
        connectionStatus: WhatsappConnectionStatus.CONNECTING,
        lastSyncAt: new Date(),
      },
    });

    let qrPayload: Record<string, unknown> | null = null;
    let qrCode: string | null = null;

    try {
      await this.evolutionApiClient.createOrEnsureInstance(
        mapping.evolutionInstanceName,
      );
      qrPayload = await this.evolutionApiClient.connectInstance(
        mapping.evolutionInstanceName,
      );
      qrCode = this.extractQrCode(qrPayload);
    } catch (error) {
      await this.prisma.companyWhatsappInstance.update({
        where: { id: mapping.id },
        data: {
          connectionStatus: WhatsappConnectionStatus.ERROR,
          lastSyncAt: new Date(),
        },
      });
      throw error;
    }

    const status = qrCode
      ? WhatsappConnectionStatus.QR_READY
      : WhatsappConnectionStatus.CONNECTING;

    await this.prisma.companyWhatsappInstance.update({
      where: { id: mapping.id },
      data: {
        connectionStatus: status,
        lastSyncAt: new Date(),
      },
    });

    return {
      success: true,
      companyId,
      evolutionInstanceName: mapping.evolutionInstanceName,
      connectionStatus: status,
      qrCode,
      requiresPhoneNumberConfirmation: !mapping.whatsappNumber,
      raw: qrPayload,
    };
  }

  async getWhatsappStatus(companyId: string, actor: AuthenticatedUser) {
    this.ensureCompanyScope(actor, companyId);
    await this.getCompanyOrFail(companyId);

    const mapping = await this.prisma.companyWhatsappInstance.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!mapping) {
      return {
        connected: false,
        companyId,
        evolutionInstanceName: null,
        whatsappNumber: null,
        connectionStatus: WhatsappConnectionStatus.DISCONNECTED,
        connectedAt: null,
        lastSyncAt: null,
        requiresPhoneNumberConfirmation: true,
      };
    }

    let nextStatus = mapping.connectionStatus;
    let connectedAt = mapping.connectedAt;
    let whatsappNumber = mapping.whatsappNumber;
    let statePayload: Record<string, unknown> | null = null;

    try {
      statePayload = await this.evolutionApiClient.getConnectionState(
        mapping.evolutionInstanceName,
      );
      nextStatus = this.parseConnectionStatus(statePayload);
      if (nextStatus === WhatsappConnectionStatus.CONNECTED && !connectedAt) {
        connectedAt = new Date();
      }

      if (nextStatus === WhatsappConnectionStatus.CONNECTED && !whatsappNumber) {
        const me = await this.evolutionApiClient.fetchConnectedNumber(
          mapping.evolutionInstanceName,
        );
        if (me.number) {
          whatsappNumber = this.normalizeWhatsappNumber(me.number);
        }
      }
    } catch {
      nextStatus =
        mapping.connectionStatus === WhatsappConnectionStatus.CONNECTED
          ? WhatsappConnectionStatus.CONNECTED
          : WhatsappConnectionStatus.ERROR;
    }

    const updated = await this.prisma.companyWhatsappInstance.update({
      where: { id: mapping.id },
      data: {
        connectionStatus: nextStatus,
        connectedAt,
        whatsappNumber,
        lastSyncAt: new Date(),
      },
    });

    return {
      connected: updated.connectionStatus === WhatsappConnectionStatus.CONNECTED,
      companyId,
      evolutionInstanceName: updated.evolutionInstanceName,
      whatsappNumber: updated.whatsappNumber,
      connectionStatus: updated.connectionStatus,
      connectedAt: updated.connectedAt,
      lastSyncAt: updated.lastSyncAt,
      requiresPhoneNumberConfirmation: !updated.whatsappNumber,
      raw: statePayload,
    };
  }

  async disconnectWhatsapp(companyId: string, actor: AuthenticatedUser) {
    this.ensureCompanyScope(actor, companyId);
    await this.getCompanyOrFail(companyId);

    const mapping = await this.prisma.companyWhatsappInstance.findFirst({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!mapping) {
      throw new NotFoundException('No Evolution instance linked to this company');
    }

    try {
      await this.evolutionApiClient.disconnectInstance(mapping.evolutionInstanceName);
    } catch {
      // We still force local status reset if remote call fails.
    }

    const updated = await this.prisma.companyWhatsappInstance.update({
      where: { id: mapping.id },
      data: {
        connectionStatus: WhatsappConnectionStatus.DISCONNECTED,
        connectedAt: null,
        lastSyncAt: new Date(),
      },
    });

    await this.prisma.notification.create({
      data: {
        companyId,
        type: NotificationType.WHATSAPP_DISCONNECTED,
        title: 'WhatsApp instance disconnected',
        message: `The Evolution instance ${updated.evolutionInstanceName} is disconnected.`,
        priority: NotificationPriority.high,
        isRead: false,
      },
    });

    return {
      success: true,
      companyId,
      evolutionInstanceName: updated.evolutionInstanceName,
      connectionStatus: updated.connectionStatus,
    };
  }

  async resolveCompanyByEvolutionInstance(instanceName: string) {
    const raw = instanceName.trim();
    const normalized = this.normalizeInstanceName(instanceName);
    if (!raw) {
      throw new BadRequestException('instance is required');
    }

    const mapping = await this.prisma.companyWhatsappInstance.findFirst({
      where: {
        OR: [
          { evolutionInstanceName: raw },
          { evolutionInstanceName: normalized },
        ],
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
      },
    });

    if (!mapping || !mapping.company) {
      throw new NotFoundException(
        `No company is linked to Evolution instance "${raw}"`,
      );
    }

    return {
      companyId: mapping.company.id,
      companyName: mapping.company.name,
      companyStatus: mapping.company.status,
      companyIsActive: mapping.company.isActive,
      evolutionInstanceName: mapping.evolutionInstanceName,
      whatsappNumber: mapping.whatsappNumber,
      connectionStatus: mapping.connectionStatus,
      connectedAt: mapping.connectedAt,
      lastSyncAt: mapping.lastSyncAt,
    };
  }
}
