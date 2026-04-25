import { Injectable } from '@nestjs/common';
import { EvolutionApiClient } from './evolution-api.client';
import {
  WhatsappSendMediaMessageInput,
  WhatsappSendMessageResult,
  WhatsappSendTextMessageInput,
} from './whatsapp.types';

@Injectable()
export class WhatsappProviderService {
  constructor(private readonly evolutionApiClient: EvolutionApiClient) {}

  async sendTextMessage(
    input: WhatsappSendTextMessageInput,
  ): Promise<WhatsappSendMessageResult> {
    const raw = await this.evolutionApiClient.sendTextMessage({
      to: input.to,
      text: input.text,
      instanceName: input.instanceName,
    });

    return {
      success: true,
      provider: 'evolution',
      messageId: this.extractMessageId(raw),
      raw,
    };
  }

  async sendMediaMessage(
    input: WhatsappSendMediaMessageInput,
  ): Promise<WhatsappSendMessageResult> {
    const raw = await this.evolutionApiClient.sendMediaMessage({
      to: input.to,
      mediaUrl: input.mediaUrl,
      fileName: input.fileName,
      caption: input.caption,
      instanceName: input.instanceName,
    });

    return {
      success: true,
      provider: 'evolution',
      messageId: this.extractMessageId(raw),
      raw,
    };
  }

  private extractMessageId(raw: Record<string, unknown>): string | null {
    const directId = raw['id'];
    if (typeof directId === 'string' && directId.trim()) {
      return directId;
    }

    const key = raw['key'];
    if (typeof key === 'string' && key.trim()) {
      return key;
    }

    const data = raw['data'];
    if (data && typeof data === 'object') {
      const nestedId = (data as Record<string, unknown>)['id'];
      if (typeof nestedId === 'string' && nestedId.trim()) {
        return nestedId;
      }
    }

    return null;
  }
}
