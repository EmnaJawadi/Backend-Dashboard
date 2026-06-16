import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../../common/utils/evolution-instance.util';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class InboundMessagesHandler {
  private readonly logger = new Logger(InboundMessagesHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  private normalizePhone(raw?: string | null): string | null {
    if (!raw) return null;

    const normalized = raw
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/[^0-9+]/g, '')
      .trim();

    if (!normalized) return null;
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  private splitName(fullName?: string | null): { firstName: string; lastName: string | null } {
    const value = (fullName ?? '').trim();

    if (!value) {
      return { firstName: 'Client', lastName: null };
    }

    const parts = value.split(/\s+/);
    const firstName = parts.shift() ?? 'Client';
    const lastName = parts.length > 0 ? parts.join(' ') : null;

    return { firstName, lastName };
  }

  private async findWhatsappInstanceByName(instanceName: string) {
    const candidates = buildEvolutionInstanceLookupCandidates(instanceName);
    const exact = candidates.length
      ? await this.prisma.companyWhatsappInstance.findFirst({
          where: {
            OR: candidates.map((candidate) => ({
              evolutionInstanceName: candidate,
            })),
          },
          include: {
            company: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (exact) {
      return exact;
    }

    const instances = await this.prisma.companyWhatsappInstance.findMany({
      include: {
        company: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return findMatchingEvolutionInstance(instances, instanceName);
  }

  async handle(payload: NormalizedWebhookDto): Promise<void> {
    const now = payload.eventAt ?? new Date();
    const phone = this.normalizePhone(payload.contactPhone);
    const names = this.splitName(payload.contactName);
    const instanceName = payload.instanceName?.trim() ?? null;

    if (!instanceName) {
      this.logger.warn(
        'Inbound webhook ignored because instanceName is missing in normalized payload',
      );
      return;
    }

    const companyInstance = await this.findWhatsappInstanceByName(instanceName);

    if (!companyInstance?.companyId) {
      this.logger.warn(
        `[WEBHOOK_ERROR] Instance not mapped to company instanceName=${instanceName}`,
      );
      throw new BadRequestException({
        error: 'Instance not mapped to company',
        instanceName,
      });
    }

    const companyId = companyInstance.companyId;
    this.logger.log(
      `[INSTANCE_FOUND] instanceName=${instanceName} mappedInstance=${companyInstance.evolutionInstanceName}`,
    );
    this.logger.log(
      `[COMPANY_FOUND] companyId=${companyId} companyName=${companyInstance.company?.name ?? 'unknown'}`,
    );

    const contact = phone
      ? await this.prisma.contact.upsert({
          where: { companyId_phone: { companyId, phone } },
          update: {
            whatsappName: payload.contactName ?? undefined,
            fullName: payload.contactName ?? undefined,
            lastSeen: now,
            updatedAt: now,
          },
          create: {
            companyId,
            phone,
            whatsappName: payload.contactName ?? names.firstName,
            fullName: payload.contactName ?? names.firstName,
            email: null,
            language: null,
            city: null,
            country: null,
            tags: [],
            notes: null,
            segment: null,
            source: 'whatsapp_webhook',
            status: 'active',
            lastSeen: now,
            createdAt: now,
            updatedAt: now,
          },
        })
      : await this.prisma.contact.create({
          data: {
            companyId,
            phone: null,
            whatsappName: payload.contactName ?? names.firstName,
            fullName: payload.contactName ?? names.firstName,
            email: null,
            language: null,
            city: null,
            country: null,
            tags: [],
            notes: null,
            segment: null,
            source: 'whatsapp_webhook',
            status: 'active',
            lastSeen: now,
            createdAt: now,
            updatedAt: now,
          },
        });

    const existingConversation = await this.prisma.conversation.findFirst({
      where: {
        companyId,
        contactId: contact.id,
        status: { not: 'closed' },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const conversation =
      existingConversation ??
      (await this.prisma.conversation.create({
        data: {
          companyId,
          contactId: contact.id,
          channel: 'whatsapp',
          status: 'bot_active',
          priority: 'medium',
          assignedTo: null,
          botPaused: false,
          handoffRequired: false,
          unreadCount: 0,
          lastMessageAt: now,
          lastCustomerMessageAt: now,
          lastBotMessageAt: null,
          lastHumanMessageAt: null,
          closedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      }));

    this.logger.log(`[CONTACT_FOUND_OR_CREATED] contactId=${contact.id}`);
    this.logger.log(
      `[CONVERSATION_FOUND_OR_CREATED] conversationId=${conversation.id}`,
    );

    if (payload.externalMessageId) {
      const duplicated = await this.prisma.message.findFirst({
        where: {
          companyId,
          externalMessageId: payload.externalMessageId,
          direction: 'inbound',
        },
      });

      if (duplicated) {
        this.logger.warn(
          `Skipping duplicated inbound webhook message externalId=${payload.externalMessageId}`,
        );
        return;
      }
    }

    let message;
    try {
      message = await this.prisma.message.create({
        data: {
        companyId,
        conversationId: conversation.id,
        externalMessageId: payload.externalMessageId,
        direction: 'inbound',
        senderType: 'customer',
        content: payload.caption ?? payload.messageText ?? '',
        messageType: payload.messageType ?? 'text',
        caption: payload.caption ?? null,
        mediaId: payload.mediaId ?? null,
        mediaUrl: payload.mediaUrl ?? null,
        mimeType: payload.mimeType ?? null,
        rawPayload: payload.rawPayload as Prisma.InputJsonValue,
        deliveryStatus: payload.deliveryStatus ?? 'delivered',
        errorMessage: null,
        createdAt: now,
        messageTimestamp: now,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        payload.externalMessageId
      ) {
        this.logger.warn(
          `Skipping concurrently duplicated inbound message externalId=${payload.externalMessageId}`,
        );
        return;
      }
      throw error;
    }

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: conversation.status === 'closed' ? 'waiting_customer' : conversation.status,
        unreadCount: {
          increment: 1,
        },
        lastMessageAt: now,
        lastCustomerMessageAt: now,
        updatedAt: now,
      },
    });

    this.logger.log(
      `[MESSAGE_SAVED] messageId=${message.id} externalMessageId=${payload.externalMessageId ?? 'n/a'} conversationId=${conversation.id}`,
    );
  }
}
