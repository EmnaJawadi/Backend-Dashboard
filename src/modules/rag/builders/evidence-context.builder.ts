export interface EvidenceItem {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export class EvidenceContextBuilder {
  build(evidences: EvidenceItem[]): string {
    if (!evidences?.length) return '';

    return this.dedupe(evidences)
      .map((e, i) => {
        const sourceId = String(e.metadata?.id ?? `source_${i + 1}`);
        const title = e.metadata?.articleTitle
          ? ` (${String(e.metadata.articleTitle)})`
          : '';

        return `[${sourceId}]${title}\n${this.dedupeSentences(e.content)}`;
      })
      .join('\n\n');
  }

  private dedupe(evidences: EvidenceItem[]): EvidenceItem[] {
    const seen = new Set<string>();
    const unique: EvidenceItem[] = [];

    for (const evidence of evidences) {
      const sourceKey = String(
        evidence.metadata?.articleId ??
          evidence.metadata?.productId ??
          evidence.metadata?.id ??
          '',
      );
      const contentKey = this.normalize(evidence.content).slice(0, 260);
      const key = sourceKey || contentKey;

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      unique.push(evidence);
    }

    return unique;
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
