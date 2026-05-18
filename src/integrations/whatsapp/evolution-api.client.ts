import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

export class EvolutionApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    readonly responseBody: Record<string, unknown> | null,
  ) {
    super(message);
  }
}

type EvolutionRequestOptions = {
  baseUrl?: string | null;
  apiKey?: string | null;
};

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
    baseUrl?: string | null;
    apiKey?: string | null;
  }): Promise<Record<string, unknown>> {
    return this.postToInstance(
      '/message/sendText',
      {
        number: params.to,
        text: params.text,
      },
      params.instanceName,
      {
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
      },
    );
  }

  async sendMediaMessage(params: {
    to: string;
    mediaUrl: string;
    fileName?: string;
    caption?: string;
    instanceName?: string;
    baseUrl?: string | null;
    apiKey?: string | null;
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
      {
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
      },
    );
  }

  async createOrEnsureInstance(
    instanceName: string,
    options?: EvolutionRequestOptions,
  ) {
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
        return await this.request('POST', '/instance/create', payload, options);
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ?? new InternalServerErrorException('Failed to create Evolution instance')
    );
  }

  async connectInstance(instanceName: string, options?: EvolutionRequestOptions) {
    try {
      return await this.request(
        'GET',
        `/instance/connect/${instanceName}`,
        undefined,
        options,
      );
    } catch {
      return this.request(
        'POST',
        `/instance/connect/${instanceName}`,
        undefined,
        options,
      );
    }
  }

  async getQrCode(instanceName: string, options?: EvolutionRequestOptions) {
    const candidates = [
      `/instance/connect/${instanceName}`,
      `/instance/qrcode/${instanceName}`,
      `/instance/qr/${instanceName}`,
    ];

    let lastError: unknown = null;

    for (const path of candidates) {
      try {
        return await this.request('GET', path, undefined, options);
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ?? new InternalServerErrorException('Failed to fetch Evolution QR code')
    );
  }

  async getConnectionState(
    instanceName: string,
    options?: EvolutionRequestOptions,
  ) {
    try {
      return await this.request(
        'GET',
        `/instance/connectionState/${instanceName}`,
        undefined,
        options,
      );
    } catch {
      return this.request(
        'GET',
        `/instance/connection-state/${instanceName}`,
        undefined,
        options,
      );
    }
  }

  async disconnectInstance(
    instanceName: string,
    options?: EvolutionRequestOptions,
  ) {
    try {
      return await this.request(
        'DELETE',
        `/instance/logout/${instanceName}`,
        undefined,
        options,
      );
    } catch {
      try {
        return await this.request(
          'POST',
          `/instance/logout/${instanceName}`,
          undefined,
          options,
        );
      } catch {
        return this.request(
          'POST',
          `/instance/disconnect/${instanceName}`,
          undefined,
          options,
        );
      }
    }
  }

  async fetchConnectedNumber(
    instanceName: string,
    options?: EvolutionRequestOptions,
  ) {
    const candidates = [
      `/instance/fetchInstances`,
      `/chat/whatsappNumbers/${instanceName}`,
      `/chat/whatsapp-numbers/${instanceName}`,
      `/instance/info/${instanceName}`,
    ];

    for (const path of candidates) {
      try {
        const payload = await this.request('GET', path, undefined, options);
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
    options?: EvolutionRequestOptions,
  ): Promise<Record<string, unknown>> {
    const resolvedInstance = instanceName ?? this.instance;
    if (!resolvedInstance) {
      throw new InternalServerErrorException('Evolution instance is not configured');
    }

    return this.request('POST', `${path}/${resolvedInstance}`, body, options);
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
    options?: EvolutionRequestOptions,
  ): Promise<Record<string, unknown>> {
    const baseUrl = (options?.baseUrl?.trim() || this.baseUrl).replace(/\/+$/, '');
    const apiKey = options?.apiKey?.trim() || this.apiKey;

    if (!baseUrl) {
      throw new InternalServerErrorException('EVOLUTION_API_URL is missing');
    }

    if (!apiKey) {
      throw new InternalServerErrorException('EVOLUTION_API_KEY is missing');
    }

    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      this.logger.log(
        `Evolution API request: method=${method} path=${path} apiKeyConfigured=${Boolean(apiKey)}`,
      );
      const response = await fetch(url, {
        method,
        headers: {
          apikey: apiKey,
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
          `Evolution API ${method} ${path} failed ${response.status}`,
        );
        throw new EvolutionApiRequestError(
          `Evolution API request failed (${response.status})`,
          response.status,
          responseBody,
        );
      }

      this.logger.log(
        `Evolution API response: method=${method} path=${path} status=${response.status}`,
      );
      return responseBody;
    } catch (error) {
      if (
        error instanceof InternalServerErrorException ||
        error instanceof EvolutionApiRequestError
      ) {
        throw error;
      }

      this.logger.error(
        `Evolution API ${method} ${path} failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to communicate with Evolution API');
    }
  }
}
