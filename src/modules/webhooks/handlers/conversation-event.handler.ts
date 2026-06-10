import { Injectable, Logger } from '@nestjs/common';
import {
  buildEvolutionInstanceLookupCandidates,
  findMatchingEvolutionInstance,
} from '../../../common/utils/evolution-instance.util';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class ConversationEventsHandler {
  private readonly logger = new Logger(ConversationEventsHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  private async findCompanyIdByInstance(instanceName: string) {
    const candidates = buildEvolutionInstanceLookupCandidates(instanceName);
    const exact = candidates.length
      ? await this.prisma.companyWhatsappInstance.findFirst({
          where: {
            OR: candidates.map((candidate) => ({
              evolutionInstanceName: candidate,
            })),
          },
          select: {
            companyId: true,
            evolutionInstanceName: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (exact?.companyId) {
      return exact.companyId;
    }

    const instances = await this.prisma.companyWhatsappInstance.findMany({
      select: {
        companyId: true,
        evolutionInstanceName: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return findMatchingEvolutionInstance(instances, instanceName)?.companyId ?? null;
  }

  private detectStatusFromPayload(payload: NormalizedWebhookDto): string | null {
    const event = String(payload.rawPayload?.event ?? '').toLowerCase();
    const status = String((payload.rawPayload?.data as Record<string, unknown> | undefined)?.status ?? '').toLowerCase();

    const value = `${event} ${status}`;

    if (value.includes('close') || value.includes('resolved')) return 'closed';
    if (value.includes('handoff') || value.includes('assign')) return 'human_assigned';
    if (value.includes('open') || value.includes('new')) return 'bot_active';

    return null;
  }

  async handle(payload: NormalizedWebhookDto): Promise<void> {
    const phone = payload.contactPhone
      ? payload.contactPhone.replace(/@s\.whatsapp\.net$/i, '').replace(/[^0-9+]/g, '')
      : null;

    const companyId = payload.instanceName
      ? await this.findCompanyIdByInstance(payload.instanceName)
      : null;

    const contact = phone
      ? await this.prisma.contact.findFirst({
          where: {
            ...(companyId ? { companyId } : {}),
            OR: [{ phone }, { phone: phone.startsWith('+') ? phone : `+${phone}` }],
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    const conversation = contact
      ? await this.prisma.conversation.findFirst({
          where: {
            contactId: contact.id,
            ...(companyId ? { companyId } : {}),
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (conversation) {
      const status = this.detectStatusFromPayload(payload);
      const now = payload.eventAt ?? new Date();

      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          ...(status ? { status } : {}),
          ...(status === 'closed' ? { closedAt: now } : {}),
          updatedAt: now,
        },
      });
    }

    this.logger.log(
      `Conversation event received: conversation=${payload.conversationExternalId ?? 'n/a'}`,
    );
  }
}
