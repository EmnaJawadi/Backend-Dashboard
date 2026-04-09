export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export function toE164Like(phone: string, defaultCountryCode = '216'): string {
  const normalized = normalizePhoneNumber(phone);

  if (normalized.startsWith('+')) {
    return normalized;
  }

  if (normalized.startsWith('00')) {
    return `+${normalized.slice(2)}`;
  }

  if (normalized.startsWith(defaultCountryCode)) {
    return `+${normalized}`;
  }

  return `+${defaultCountryCode}${normalized}`;
}

export function maskPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumber(phone);

  if (normalized.length <= 4) {
    return normalized;
  }

  const visiblePart = normalized.slice(-4);
  const maskedPart = '*'.repeat(Math.max(0, normalized.length - 4));

  return `${maskedPart}${visiblePart}`;
}