export type EvolutionInstanceLike = {
  evolutionInstanceName: string | null;
};

export function normalizeEvolutionInstanceSlug(
  value?: string | null,
): string | null {
  const normalized = value
    ?.toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || null;
}

export function normalizeEvolutionInstanceCompact(
  value?: string | null,
): string | null {
  const normalized = value
    ?.toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '');

  return normalized || null;
}

export function normalizeEvolutionInstanceBase(
  value?: string | null,
): string | null {
  const slug = normalizeEvolutionInstanceSlug(value);
  const withoutGeneratedSuffix = slug?.replace(/_[a-f0-9]{8}$/i, '');

  return normalizeEvolutionInstanceCompact(withoutGeneratedSuffix);
}

export function buildEvolutionInstanceLookupCandidates(
  value?: string | null,
): string[] {
  const raw = value?.trim();
  const slug = normalizeEvolutionInstanceSlug(raw);
  const compact = normalizeEvolutionInstanceCompact(raw);
  const base = normalizeEvolutionInstanceBase(raw);
  const candidates = new Set<string>();

  if (raw) {
    candidates.add(raw);
    candidates.add(raw.toLowerCase());
    candidates.add(raw.toUpperCase());
  }

  if (slug) {
    candidates.add(slug);
  }

  if (compact) {
    candidates.add(compact);
  }

  if (base) {
    candidates.add(base);
  }

  return Array.from(candidates);
}

export function isEvolutionInstanceMatch(
  stored?: string | null,
  received?: string | null,
): boolean {
  if (!stored || !received) {
    return false;
  }

  const storedRaw = stored.trim();
  const receivedRaw = received.trim();

  return (
    storedRaw.toLowerCase() === receivedRaw.toLowerCase() ||
    normalizeEvolutionInstanceSlug(storedRaw) ===
      normalizeEvolutionInstanceSlug(receivedRaw) ||
    normalizeEvolutionInstanceCompact(storedRaw) ===
      normalizeEvolutionInstanceCompact(receivedRaw) ||
    normalizeEvolutionInstanceBase(storedRaw) ===
      normalizeEvolutionInstanceBase(receivedRaw)
  );
}

export function findMatchingEvolutionInstance<T extends EvolutionInstanceLike>(
  instances: T[],
  received?: string | null,
): T | null {
  return (
    instances.find((instance) =>
      isEvolutionInstanceMatch(instance.evolutionInstanceName, received),
    ) ?? null
  );
}
