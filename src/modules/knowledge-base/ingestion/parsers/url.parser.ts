import { Injectable, BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface ParsedKbSource {
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class UrlParser {
  private readonly timeoutMs = 8000;
  private readonly maxResponseBytes = 2 * 1024 * 1024;
  private readonly maxRedirects = 3;

  async parse(url: string): Promise<ParsedKbSource> {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    let currentUrl = this.parseAndValidateUrl(url);
    let response: Response | null = null;

    for (let redirect = 0; redirect <= this.maxRedirects; redirect++) {
      await this.assertPublicDestination(currentUrl);
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'text/html,text/plain;q=0.9',
          'User-Agent': 'WhatsAppSupportKbImporter/1.0',
        },
      }).catch(() => {
        throw new BadRequestException('Unable to fetch the requested URL safely');
      });

      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location || redirect === this.maxRedirects) {
        throw new BadRequestException('Too many or invalid URL redirects');
      }
      currentUrl = this.parseAndValidateUrl(new URL(location, currentUrl).toString());
    }

    if (!response) {
      throw new BadRequestException('Unable to fetch URL');
    }

    if (!response.ok) {
      throw new BadRequestException('Unable to fetch URL');
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new BadRequestException('URL content type must be HTML or plain text');
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > this.maxResponseBytes) {
      throw new BadRequestException('URL content is too large');
    }

    const html = await this.readLimitedBody(response);

    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || 'Untitled page';

    const content = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      title,
      content,
      metadata: {
        sourceType: 'url',
        sourceUrl: currentUrl.toString(),
      },
    };
  }

  private parseAndValidateUrl(value: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('URL is invalid');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Only HTTP and HTTPS URLs are allowed');
    }
    if (parsed.username || parsed.password) {
      throw new BadRequestException('URLs containing credentials are not allowed');
    }
    return parsed;
  }

  private async assertPublicDestination(url: URL) {
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new BadRequestException('Private network URLs are not allowed');
    }

    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true }).catch(() => {
          throw new BadRequestException('URL hostname cannot be resolved');
        });

    if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address))) {
      throw new BadRequestException('Private or reserved network URLs are not allowed');
    }
  }

  private isPrivateAddress(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized.includes(':')) {
      if (normalized.startsWith('::ffff:')) {
        return this.isPrivateAddress(normalized.slice('::ffff:'.length));
      }
      return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        /^fe[89ab]/.test(normalized) ||
        normalized.startsWith('2001:db8:')
      );
    }

    const octets = normalized.split('.').map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) return true;
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 0 && octets[2] === 2) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && octets[2] === 113) ||
      a >= 224
    );
  }

  private async readLimitedBody(response: Response): Promise<string> {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > this.maxResponseBytes) {
        await reader.cancel();
        throw new BadRequestException('URL content is too large');
      }
      chunks.push(value);
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }
}
