import { BadRequestException, Injectable } from '@nestjs/common';

const yaml = require('js-yaml') as {
  load: (content: string) => unknown;
};

@Injectable()
export class StructuredDataParser {
  parse(
    buffer: Buffer,
    type: 'json' | 'yaml',
    filename?: string,
  ): string {
    if (!buffer?.length) {
      throw new BadRequestException(`${type.toUpperCase()} buffer is empty`);
    }

    try {
      const raw = buffer.toString('utf-8').replace(/^\uFEFF/, '').trim();
      const parsed = type === 'json' ? JSON.parse(raw) : yaml.load(raw);
      const content = this.toReadableText(parsed);

      if (!content) {
        throw new Error('Structured document is empty');
      }

      return content;
    } catch {
      throw new BadRequestException(
        `Unable to parse ${type.toUpperCase()} file: ${filename ?? 'unknown file'}`,
      );
    }
  }

  private toReadableText(value: unknown, path = ''): string {
    if (value === null || value === undefined) {
      return path ? `${path}: null` : '';
    }

    if (Array.isArray(value)) {
      return value
        .map((item, index) =>
          this.toReadableText(item, path ? `${path} ${index + 1}` : `item ${index + 1}`),
        )
        .filter(Boolean)
        .join('\n\n');
    }

    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => {
          const nextPath = path ? `${path} - ${key}` : key;
          return this.toReadableText(item, nextPath);
        })
        .filter(Boolean)
        .join('\n\n');
    }

    return `${path || 'value'}: ${String(value)}`;
  }
}
