import { Injectable } from '@nestjs/common';

type RetrievalFilterOptions = {
  allowedCategories?: string[];
  intent?: string | null;
};

@Injectable()
export class RetrievalPolicyService {
  private readonly minScore = 0.35;

  getTopK(): number {
    return 5;
  }

  getMinScore(): number {
    return this.minScore;
  }

  filter<T extends { score?: number; metadata?: Record<string, unknown> }>(
    results: T[],
    options?: RetrievalFilterOptions,
  ) {
    const allowedCategorySet = new Set(
      (options?.allowedCategories ?? []).map((category) =>
        this.normalizeCategory(category),
      ),
    );

    return results.filter((result) => {
      if ((result.score ?? 0) < this.minScore) {
        return false;
      }

      if (allowedCategorySet.size === 0) {
        return false;
      }

      const category = this.normalizeCategory(
        typeof result.metadata?.category === 'string'
          ? result.metadata.category
          : null,
      );

      if (!category || !allowedCategorySet.has(category)) {
        return false;
      }

      if (
        this.isSensitiveCategory(category) &&
        !this.isSensitiveIntent(options?.intent)
      ) {
        return false;
      }

      if (
        this.isInternalOnly(result.metadata?.metadata) &&
        !this.isSensitiveIntent(options?.intent)
      ) {
        return false;
      }

      return true;
    });
  }

  private normalizeCategory(category?: string | null): string {
    return (category ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private isSensitiveCategory(category: string): boolean {
    return [
      'SECURITE_ALIMENTAIRE',
      'RECLAMATION',
      'RECLAMATIONS',
      'COMPLAINT',
      'COMPLAINTS',
      'SAFETY',
      'SECURITE',
      'PROCEDURE_INTERNE',
      'INTERNAL',
      'INTERNE',
    ].includes(category);
  }

  private isSensitiveIntent(intent?: string | null): boolean {
    return intent === 'FOOD_COMPLAINT';
  }

  private isInternalOnly(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return false;
    }

    const record = metadata as Record<string, unknown>;

    return record.internalOnly === true;
  }
}
