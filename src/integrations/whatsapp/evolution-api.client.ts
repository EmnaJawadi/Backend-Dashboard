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
  }): Promise<Record<string, unknown>> {
    return this.post('/message/sendText', {
      number: params.to,
      text: params.text,
    });
  }

  async sendTemplateMessage(params: {
    to: string;
    templateName: string;
    language?: string;
    parameters?: string[];
    variables?: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    const bodyParameters = (params.parameters ?? []).map((text) => ({
      type: 'text',
      text,
    }));

    return this.post(
      '/message/sendTemplate',
      this.omitUndefined({
        number: params.to,
        name: params.templateName,
        language: {
          code: params.language ?? 'fr',
        },
        components:
          bodyParameters.length > 0
            ? [
                {
                  type: 'body',
                  parameters: bodyParameters,
                },
              ]
            : undefined,
        variables: params.variables,
      }),
    );
  }

  async sendMediaMessage(params: {
    to: string;
    mediaUrl: string;
    fileName?: string;
    caption?: string;
  }): Promise<Record<string, unknown>> {
    return this.post('/message/sendMedia', {
      number: params.to,
      mediatype: 'document',
      mimetype: 'application/octet-stream',
      media: params.mediaUrl,
      fileName: params.fileName ?? 'file',
      caption: params.caption ?? '',
    });
  }

  private omitUndefined(data: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.baseUrl || !this.instance) {
      throw new InternalServerErrorException(
        'Evolution API configuration is missing',
      );
    }

    const url = `${this.baseUrl}${path}/${this.instance}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey,
        },
        body: JSON.stringify(body),
      });

      const contentType = response.headers.get('content-type') ?? '';
      const responseBody = contentType.includes('application/json')
        ? ((await response.json()) as Record<string, unknown>)
        : ({ message: await response.text() } as Record<string, unknown>);

      if (!response.ok) {
        this.logger.error(
          `Evolution API error ${response.status}: ${JSON.stringify(responseBody)}`,
        );
        throw new InternalServerErrorException('Evolution API request failed');
      }

      return responseBody;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Evolution API request failed: ${(error as Error).message}`,
      );
      throw new InternalServerErrorException('Failed to communicate with Evolution API');
    }
  }
}
