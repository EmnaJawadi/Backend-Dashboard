import { Injectable } from '@nestjs/common';

type EvidenceLike = {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class CustomerReplyFormatterService {
  private readonly forbiddenPatterns = [
    /\b[A-Z]{2,10}-\d{2,6}\b/i,
    /\bCode article\s*:/i,
    /\bArticle\s*:/i,
    /\bCat(?:e|\u00e9|\u00c3\u00a9)gorie\s*:/i,
    /\bR(?:e|\u00e9|\u00c3\u00a9)ponses possibles\s*:/i,
    /\bMots-cl(?:e|\u00e9|\u00c3\u00a9)s(?:\s+IA)?\s*:/i,
    /\bActions recommand(?:e|\u00e9|\u00c3\u00a9)es\s*:/i,
    /\bSource\s*:/i,
    /\bCanaux\s*:/i,
    /\bbase\s+de\s+connaissances?\b/i,
    /\bagent\s+humain\b/i,
    /\bhandoff\b/i,
    /\bescalade\b/i,
    /\bescalation\b/i,
    /\btransf(?:ert|erer|ere|eree|eres|erons|erez|eront|ererai|ereras|erons|erez|eront)\b/i,
    /\btransf(?:érer|ère|érée|érées|érons|érez|érerai|éreras)\b/i,
    /\btransmets?\b/i,
    /\btransmettre\b/i,
    /\bsupport\s+interne\b/i,
    /\breview\s+interne\b/i,
    /\bRAG\b/i,
    /\bsource\s*ID\b/i,
    /\barticle\s*ID\b/i,
    /\binternal\s+notes?\b/i,
    /\bmetadata\b/i,
    /\bchunkIndex\b/i,
    /\bsourceUrl\b/i,
    /\barticleId\b/i,
    /\bkb:\/\/[a-z0-9._/-]+\b/i,
    /"intent"\s*:/i,
    /"answer"\s*:/i,
    /"sources"\s*:/i,
  ];

  buildCustomerEvidenceContext(evidences: EvidenceLike[]): string {
    const snippets = evidences
      .slice(0, 5)
      .map((evidence) => this.buildCustomerEvidenceSnippet(evidence))
      .filter((snippet) => snippet.length > 0)
      .slice(0, 5);

    if (!snippets.length) {
      return '';
    }

    return snippets
      .map((snippet, index) => `Information ${index + 1}: ${snippet}`)
      .join('\n');
  }

  private buildCustomerEvidenceSnippet(evidence: EvidenceLike): string {
    const contentSnippet = this.extractCustomerSnippet(evidence.content);
    const metadataFacts = this.extractSafeMetadataFacts(
      evidence.metadata?.metadata,
    );

    return [contentSnippet, ...metadataFacts]
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join(' ');
  }

  private extractSafeMetadataFacts(metadata: unknown): string[] {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return [];
    }

    const record = metadata as Record<string, unknown>;
    const facts: string[] = [];
    const availableItems = this.toStringList(record.availableItems);
    const unavailableItems = this.toStringList(record.unavailableItems);
    const pricedItems = this.toPricedItems(record.pricedItems);
    const menuGroups = this.toMenuGroups(record.menuGroups);

    if (availableItems.length) {
      facts.push(`Options disponibles: ${availableItems.join(', ')}.`);
    }

    if (unavailableItems.length) {
      facts.push(`Options non disponibles: ${unavailableItems.join(', ')}.`);
    }

    if (pricedItems.length) {
      facts.push(
        `Prix: ${pricedItems
          .map((item) => `${item.item} ${item.price}`)
          .join(', ')}.`,
      );
    }

    for (const group of menuGroups) {
      facts.push(`${group.label}: ${group.items.join(', ')}.`);
    }

    return facts;
  }

  private toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private toPricedItems(value: unknown): Array<{ item: string; price: string }> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }

    return Object.entries(value as Record<string, unknown>)
      .map(([item, price]) => ({
        item: item.trim(),
        price: typeof price === 'string' ? price.trim() : '',
      }))
      .filter((item) => item.item.length > 0 && item.price.length > 0);
  }

  private toMenuGroups(value: unknown): Array<{ label: string; items: string[] }> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }

        const record = item as Record<string, unknown>;
        const label = typeof record.label === 'string' ? record.label.trim() : '';
        const items = this.toStringList(record.items);

        return label && items.length ? { label, items } : null;
      })
      .filter(
        (item): item is { label: string; items: string[] } => item !== null,
      );
  }

  formatGeneratedAnswer(params: {
    answer: string;
    userMessage: string;
    intent: string;
    evidences: EvidenceLike[];
    companyName?: string | null;
  }): { answer: string; replaced: boolean; reason: string | null } {
    const sanitized = this.sanitizeCustomerAnswer(params.answer);

    if (sanitized && !this.containsForbiddenLeak(sanitized)) {
      return {
        answer: this.limitLength(sanitized),
        replaced: sanitized !== params.answer.trim(),
        reason: sanitized !== params.answer.trim() ? 'sanitized_answer' : null,
      };
    }

    const fallback = this.buildNaturalFallbackAnswer(params);

    return {
      answer: fallback,
      replaced: true,
      reason: 'forbidden_kb_leak_replaced',
    };
  }

  buildNaturalFallbackAnswer(params: {
    userMessage: string;
    intent: string;
    evidences: EvidenceLike[];
    companyName?: string | null;
  }): string {
    const userText = this.normalize(params.userMessage);
    const evidenceContext = this.buildCustomerEvidenceContext(params.evidences);
    const companyLabel = this.buildCompanyLabel(params.companyName);
    const bestSnippet =
      evidenceContext
        .split(/\n+/)
        .map((line) => line.replace(/^Information\s+\d+\s*:\s*/i, '').trim())
        .find((line) => line.length > 0) ?? '';

    if (this.isGreetingWithServiceQuestion(userText)) {
      if (bestSnippet) {
        return this.limitLength(
          `Bonjour${companyLabel}. ${this.makeConversational(bestSnippet, userText)}`,
        );
      }

      return [
        `Bonjour${companyLabel}.`,
        'Je peux vous aider avec les informations disponibles pour cette entreprise.',
        'Comment puis-je vous aider ?',
      ].join('\n');
    }

    if (params.intent === 'greeting') {
      return `Bonjour${companyLabel}. Comment puis-je vous aider ?`;
    }

    if (bestSnippet) {
      return this.limitLength(this.makeConversational(bestSnippet, userText));
    }

    return this.buildHandoffMessage();
  }

  buildHandoffMessage(): string {
    return "Nous avons bien recu votre demande. Elle necessite une verification complementaire et notre equipe vous repondra des que possible.";
  }

  containsForbiddenLeak(answer: string): boolean {
    const trimmed = answer.trim();

    if (!trimmed) {
      return false;
    }

    if (/^\s*[{[]/.test(trimmed)) {
      return true;
    }

    return this.forbiddenPatterns.some((pattern) => pattern.test(trimmed));
  }

  private extractCustomerSnippet(content: string): string {
    const compact = content.replace(/\s+/g, ' ').trim();
    const responses = this.extractResponseOptions(compact);

    if (responses.length > 0) {
      return responses
        .filter((response) => !this.isInternalInstruction(response))
        .slice(0, 3)
        .join(' ');
    }

    const description = this.extractField(compact, 'Description');
    if (description && !this.isInternalInstruction(description)) {
      return this.sanitizeCustomerAnswer(description);
    }

    return this.sanitizeCustomerAnswer(compact);
  }

  private extractResponseOptions(content: string): string[] {
    const match = content.match(
      /R(?:e|\u00e9|\u00c3\u00a9)ponses possibles\s*:\s*(.*?)(?:\s+Mots-cl(?:e|\u00e9|\u00c3\u00a9)s(?:\s+IA)?\s*:|\s+Actions recommand(?:e|\u00e9|\u00c3\u00a9)es\s*:|\s+Source\s*:|\s+Canaux\s*:|$)/i,
    );
    const section = match?.[1]?.trim();

    if (!section) {
      return [];
    }

    return section
      .split(/\s+-\s+/)
      .map((item) => this.sanitizeCustomerAnswer(item))
      .filter((item) => item.length > 0 && !this.containsForbiddenLeak(item));
  }

  private extractField(content: string, label: string): string | null {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(
      new RegExp(`${escaped}\\s*:\\s*(.*?)(?:\\s+[A-Z][\\w\\s\\u00e9\\u00e8\\u00e0\\u00ea\\u00ee\\u00f4\\u00fb\\u00e7-]{2,}\\s*:|$)`, 'i'),
    );

    return match?.[1]?.trim() ?? null;
  }

  private sanitizeCustomerAnswer(answer: string): string {
    const unwrapped = this.unwrapJsonAnswer(answer)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const lines = unwrapped
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !this.forbiddenPatterns.some((pattern) => pattern.test(line)));

    const cleaned = lines
      .join('\n')
      .replace(/\b[A-Z]{2,10}-\d{2,6}\s*-\s*/g, '')
      .replace(/\bCode article\s*:\s*[^.?!\n]+/gi, '')
      .replace(/\bCat(?:e|\u00e9|\u00c3\u00a9)gorie\s*:\s*[^.?!\n]+/gi, '')
      .replace(/\bR(?:e|\u00e9|\u00c3\u00a9)ponses possibles\s*:\s*/gi, '')
      .replace(/\bMots-cl(?:e|\u00e9|\u00c3\u00a9)s(?:\s+IA)?\s*:\s*[^.?!\n]+/gi, '')
      .replace(/\bSource\s*:\s*[^.?!\n]+/gi, '')
      .replace(/\bCanaux\s*:\s*[^.?!\n]+/gi, '')
      .replace(/\bContenu\s*:\s*/gi, '')
      .replace(/^[-"\s]+|["\s]+$/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    return cleaned;
  }

  private unwrapJsonAnswer(value: string): string {
    const trimmed = value.trim();

    if (!trimmed.startsWith('{')) {
      return trimmed;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as { answer?: unknown }).answer === 'string'
      ) {
        return (parsed as { answer: string }).answer;
      }
    } catch {
      return trimmed;
    }

    return trimmed;
  }

  private isInternalInstruction(value: string): boolean {
    return /\b(l'ia|ia doit|transf|statut conversation|metadata|source)\b/i.test(
      value,
    );
  }

  private isGreetingWithServiceQuestion(normalized: string): boolean {
    return (
      /(bonjour|bonsoir|salut|salam|hello|hi)/.test(normalized) &&
      /(service|services|que.*faites|vous proposez|3andkom|3andkoum)/.test(
        normalized,
      )
    );
  }

  private makeConversational(snippet: string, normalizedUserText: string): string {
    const cleaned = snippet.replace(/^Voici les informations disponibles\s*:\s*/i, '');

    if (/prix|combien|tarif|soum/.test(normalizedUserText)) {
      return cleaned;
    }

    if (/livraison|deliver|tousel|adresse/.test(normalizedUserText)) {
      return cleaned;
    }

    if (/menu|services|service|quoi|chnoua|3andkom|3andkoum/.test(normalizedUserText)) {
      return cleaned;
    }

    return cleaned;
  }

  private limitLength(answer: string): string {
    const trimmed = answer.trim();

    if (trimmed.length <= 900) {
      return trimmed;
    }

    return `${trimmed.slice(0, 880).trim()}...`;
  }

  private buildCompanyLabel(companyName?: string | null): string {
    const normalized = companyName?.trim();

    return normalized ? ` chez ${normalized}` : '';
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
