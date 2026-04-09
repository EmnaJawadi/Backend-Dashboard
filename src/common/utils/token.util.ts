import { randomBytes } from 'crypto';

export function generateRandomToken(size = 32): string {
  return randomBytes(size).toString('hex');
}

export function generateNumericToken(length = 6): string {
  const digits = '0123456789';
  let token = '';

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    token += digits[randomIndex];
  }

  return token;
}