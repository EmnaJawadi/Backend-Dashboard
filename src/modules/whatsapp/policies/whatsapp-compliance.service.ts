import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class WhatsappComplianceService {
  validatePhoneNumber(phoneNumber: string) {
    const normalized = phoneNumber.replace(/\s+/g, '');

    if (!/^\+?[0-9]{8,15}$/.test(normalized)) {
      throw new BadRequestException('Invalid WhatsApp phone number format');
    }

    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  validateMessageContent(message: string) {
    const trimmed = message.trim();

    if (!trimmed) {
      throw new BadRequestException('Message content cannot be empty');
    }

    if (trimmed.length > 4096) {
      throw new BadRequestException('Message content is too long');
    }

    return trimmed;
  }
}
