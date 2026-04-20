export interface EvidenceItem {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export class EvidenceContextBuilder {
  build(evidences: EvidenceItem[]): string {
    if (!evidences?.length) return '';

    return evidences
      .map((e, i) => {
        const sourceId = String(e.metadata?.id ?? `source_${i + 1}`);
        const title = e.metadata?.articleTitle
          ? ` (${String(e.metadata.articleTitle)})`
          : '';

        return `[${sourceId}]${title}\n${e.content}`;
      })
      .join('\n\n');
  }
}
