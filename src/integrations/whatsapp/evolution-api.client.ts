import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

@Injectable()
export class EvolutionApiClient {
  private readonly logger = new Logger(EvolutionApiClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instance: string;

  constructor() {
    this.baseUrl = (process.env.EVOLUTION_API_URL ?? '').replace(/\/+$/, '');
    this.apiKey = process.env.EVOLUTION_API_KEY ?? '';
    this.instance =
      process.env.EVOLUTION_INSTANCE ??
      process.env.WHATSAPP_DEFAULT_INSTANCE ??
      '';
  }

  async sendTextMessage(params: {
    to: string;
    text: string;
    instanceName?: string;
  }): Promise<Record<string, unknown>> {
    return this.postToInstance(
      '/message/sendText',
      {
        number: params.to,
        text: params.text,
      },
      params.instanceName,
    );
  }

  async sendMediaMessage(params: {
    to: string;
    mediaUrl: string;
    fileName?: string;
    caption?: string;
    instanceName?: string;
  }): Promise<Record<string, unknown>> {
    return this.postToInstance(
      '/message/sendMedia',
      {
        number: params.to,
        mediatype: 'document',
        mimetype: 'application/octet-stream',
        media: params.mediaUrl,
        fileName: params.fileName ?? 'file',
        caption: params.caption ?? '',
      },
      params.instanceName,
    );
  }

  async createOrEnsureInstance(instanceName: string) {
    const payloads = [
      {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      },
      {
        instance: instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      },
    ];

    let lastError: unknown = null;

    for (const payload of payloads) {
      try {
        return await this.request('POST', '/instance/create', payload);
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ?? new InternalServerErrorException('Failed to create Evolution instance')
    );
  }

  async connectInstance(instanceName: string) {
    try {
      return await this.request('GET', `/instance/connect/${instanceName}`);
    } catch {
      return this.request('POST', `/instance/connect/${instanceName}`);
    }
  }

  async getConnectionState(instanceName: string) {
    try {
      return await this.request('GET', `/instance/connectionState/${instanceName}`);
    } catch {
      return this.request('GET', `/instance/connection-state/${instanceName}`);
    }
  }

  async disconnectInstance(instanceName: string) {
    try {
      return await this.request('DELETE', `/instance/logout/${instanceName}`);
    } catch {
      try {
        return await this.request('POST', `/instance/logout/${instanceName}`);
      } catch {
        return this.request('POST', `/instance/disconnect/${instanceName}`);
      }
    }
  }

  async fetchConnectedNumber(instanceName: string) {
    const candidates = [
      `/instance/fetchInstances`,
      `/chat/whatsappNumbers/${instanceName}`,
      `/chat/whatsapp-numbers/${instanceName}`,
      `/instance/info/${instanceName}`,
    ];

    for (const path of candidates) {
      try {
        const payload = await this.request('GET', path);
        const number = this.extractPhoneNumber(payload, instanceName);
        if (number) {
          return {
            number,
            raw: payload,
          };
        }
      } catch {
        continue;
      }
    }

    return {
      number: null,
      raw: null,
    };
  }

  private extractPhoneNumber(
    payload: Record<string, unknown>,
    instanceName: string,
  ): string | null {
    const scan = (value: unknown): string | null => {
      if (typeof value === 'string' && value.trim()) {
        const normalized = value.replace(/[^0-9+]/g, '').trim();
        if (normalized.length >= 8) {
          return normalized;
        }
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const found = scan(item);
          if (found) return found;
        }
      }

      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const directCandidates = [
          record.number,
          record.phone,
          record.wuid,
          record.owner,
          record.me,
          record.jid,
        ];

        for (const candidate of directCandidates) {
          const found = scan(candidate);
          if (found) return found;
        }

        const entries = Object.entries(record);
        for (const [, nested] of entries) {
          const found = scan(nested);
          if (found) return found;
        }
      }

      return null;
    };

    if (Array.isArray(payload.instances)) {
      const instance = payload.instances.find((item) => {
        const row = item as Record<string, unknown>;
        return (
          row.instanceName === instanceName ||
          row.name === instanceName ||
          row.instance === instanceName
        );
      });

      if (instance) {
        const number = scan(instance);
        if (number) return number;
      }
    }

    return scan(payload);
  }

  private async postToInstance(
    path: string,
    body: Record<string, unknown>,
    instanceName?: string,
  ): Promise<Record<string, unknown>> {
    const resolvedInstance = instanceName ?? this.instance;
    if (!resolvedInstance) {
      throw new InternalServerErrorException('Evolution instance is not configured');
    }

    return this.request('POST', `${path}/${resolvedInstance}`, body);
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.baseUrl) {
      throw new InternalServerErrorException('EVOLUTION_API_URL is missing');
    }

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          apikey: this.apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      const contentType = response.headers.get('content-type') ?? '';
      const responseBody = contentType.includes('application/json')
        ? ((await response.json()) as Record<string, unknown>)
        : ({ message: await response.text() } as Record<string, unknown>);

      if (!response.ok) {
        this.logger.warn(
          `Evolution API ${method} ${path} failed ${response.status}: ${JSON.stringify(responseBody)}`,
        );
        throw new InternalServerErrorException(
          `Evolution API request failed (${response.status})`,
        );
      }

      return responseBody;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Evolution API ${method} ${path} failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to communicate with Evolution API');
    }
  }
}
