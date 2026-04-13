import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NormalizedWebhookDto } from '../dto/normalized-webhook.dto';

@Injectable()
export class ConversationEventsHandler {
  private readonly logger = new Logger(ConversationEventsHandler.name);

  constructor(private readonly prisma: PrismaService) {}

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

    const contact = phone
      ? await this.prisma.contact.findFirst({
          where: {
            OR: [{ phone }, { phone: phone.startsWith('+') ? phone : `+${phone}` }],
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    const conversation = contact
      ? await this.prisma.conversation.findFirst({
          where: { contactId: contact.id },
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
