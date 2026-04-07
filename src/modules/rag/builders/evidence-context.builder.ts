export interface EvidenceItem {
  content: string;
  score?: number;
}

export class EvidenceContextBuilder {
  build(evidences: EvidenceItem[]): string {
    if (!evidences?.length) return '';

    return evidences
      .map((e, i) => `#${i + 1}: ${e.content}`)
      .join('\n\n');
  }
}