import { Injectable } from '@nestjs/common';

type RetrievalFilterOptions = {
  allowedCategories?: string[];
  intent?: string | null;
};

@Injectable()
export class RetrievalPolicyService {
  private readonly minScore = 0.35;

  getTopK(): number {
    return 8;
  }

  getMinScore(): number {
    return this.minScore;
  }

  filter<T extends { score?: number; metadata?: Record<string, unknown> }>(
    results: T[],
    options?: RetrievalFilterOptions,
  ): T[] {
    const allowedCategories = new Set(
      (options?.allowedCategories ?? []).map((category) =>
        this.normalize(category),
      ),
    );

    return results.filter((result) => {
      if ((result.score ?? 0) < this.minScore) {
        return false;
      }

      const category = this.normalize(
        typeof result.metadata?.category === 'string'
          ? result.metadata.category
          : '',
      );

      if (
        allowedCategories.size > 0 &&
        (!category || !allowedCategories.has(category))
      ) {
        return false;
      }

      if (this.isInternalOnly(result.metadata?.metadata)) {
        return false;
      }

      if (this.isCustomerFacingFalse(result.metadata?.metadata)) {
        return false;
      }

      if (this.isRestrictedCategory(category) && !this.canUseRestrictedEvidence(options?.intent)) {
        return false;
      }

      return true;
    });
  }

  rank<T extends { score?: number }>(
    results: T[],
    _options?: RetrievalFilterOptions,
  ): T[] {
    return [...results].sort((left, right) => (right.score ?? 0) - (left.score ?? 0));
  }

  private normalize(value: string): string {
    return value
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private isRestrictedCategory(category: string): boolean {
    return [
      'INTERNAL',
      'PRIVATE',
      'SECURITY',
      'LEGAL',
      'COMPLAINT',
      'INCIDENT',
      'FRAUD',
      'PRIVACY',
    ].includes(category);
  }

  private canUseRestrictedEvidence(intent?: string | null): boolean {
    return [
      'COMPLAINT',
      'INCIDENT',
      'SECURITY',
      'LEGAL',
      'FRAUD',
      'PRIVACY',
      'HUMAN_REVIEW_REQUIRED',
    ].includes(this.normalize(intent ?? ''));
  }

  private isInternalOnly(metadata: unknown): boolean {
    return this.metadataFlag(metadata, 'internalOnly') === true;
  }

  private isCustomerFacingFalse(metadata: unknown): boolean {
    return this.metadataFlag(metadata, 'customerFacing') === false;
  }

  private metadataFlag(metadata: unknown, key: string): boolean | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }

    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === 'boolean' ? value : undefined;
  }
}
