import { BadRequestException } from '@nestjs/common';
import { ConversationWindowStatus } from '../policies/conversation-window.service';

export class TemplateRequiredException extends BadRequestException {
  constructor(windowStatus: ConversationWindowStatus) {
    super({
      code: 'TEMPLATE_REQUIRED',
      message:
        'Free-form WhatsApp messages are blocked because the 24-hour customer service window is closed. Send an approved template message instead.',
      canSendFreeForm: false,
      templateRequired: true,
      reason: windowStatus.reason ?? '24_HOUR_WINDOW_CLOSED',
      window: windowStatus,
    });
  }
}
