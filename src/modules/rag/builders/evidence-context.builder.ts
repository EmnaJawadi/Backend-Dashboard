import { deduplicateRagResults } from '../utils/deduplicate-rag-results';

export interface EvidenceItem {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export class EvidenceContextBuilder {
  build(evidences: EvidenceItem[]): string {
    if (!evidences?.length) return '';

    return deduplicateRagResults(evidences, 6)
      .map((e, i) => {
        const sourceId = String(e.metadata?.id ?? `source_${i + 1}`);
        return `[${sourceId}]\n${this.dedupeSentences(e.content)}`;
      })
      .join('\n\n');
  }

  private dedupeSentences(content: string): string {
    const seen = new Set<string>();

    return content
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => {
        const key = this.normalize(sentence);

        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .join(' ');
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
