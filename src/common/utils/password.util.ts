import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';

const BCRYPT_PREFIX = /^\$2[aby]\$/;
const DEFAULT_BCRYPT_ROUNDS = 12;

function getBcryptRounds(): number {
  const raw = Number(process.env.BCRYPT_SALT_ROUNDS ?? DEFAULT_BCRYPT_ROUNDS);
  if (!Number.isFinite(raw)) {
    return DEFAULT_BCRYPT_ROUNDS;
  }

  return Math.max(10, Math.trunc(raw));
}

function hashLegacySha256(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function isBcryptHash(hash: string): boolean {
  return BCRYPT_PREFIX.test(hash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, getBcryptRounds());
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (isBcryptHash(storedHash)) {
    const valid = await bcrypt.compare(password, storedHash);
    return {
      valid,
      needsRehash: false,
    };
  }

  const valid = hashLegacySha256(password) === storedHash;

  return {
    valid,
    needsRehash: valid,
  };
}
