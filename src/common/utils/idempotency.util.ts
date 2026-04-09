import { createHash } from 'crypto';

export function generateIdempotencyKey(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildIdempotencySignature(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((part) => String(part ?? '')).join(':');
}