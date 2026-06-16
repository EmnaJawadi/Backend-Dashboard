export type DeduplicableRagResult = {
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export function deduplicateRagResults<T extends DeduplicableRagResult>(
  results: T[],
  maxChunksPerArticle = 2,
): T[] {
  const limit = Math.max(1, Math.floor(maxChunksPerArticle));
  const sorted = [...results].sort(
    (left, right) => (right.score ?? 0) - (left.score ?? 0),
  );
  const seenChunkIds = new Set<string>();
  const seenContents = new Set<string>();
  const articleCounts = new Map<string, number>();
  const unique: T[] = [];

  for (const result of sorted) {
    const contentKey = normalize(result.content);
    if (!contentKey || seenContents.has(contentKey)) {
      continue;
    }

    const chunkId = text(result.metadata?.chunkId ?? result.metadata?.id);
    if (chunkId && seenChunkIds.has(chunkId)) {
      continue;
    }

    const articleId = text(result.metadata?.articleId);
    const articleTitle = normalize(
      text(result.metadata?.articleTitle ?? result.metadata?.title),
    );
    const productId = text(result.metadata?.productId);
    const articleKeys = [
      articleId ? `article:${articleId}` : '',
      articleTitle ? `title:${articleTitle}` : '',
      productId ? `product:${productId}` : '',
    ].filter(Boolean);
    if (!articleKeys.length) {
      articleKeys.push(
        chunkId
          ? `chunk:${chunkId}`
          : `content:${contentKey.slice(0, 260)}`,
      );
    }

    if (articleKeys.some((key) => (articleCounts.get(key) ?? 0) >= limit)) {
      continue;
    }

    seenContents.add(contentKey);
    if (chunkId) {
      seenChunkIds.add(chunkId);
    }
    for (const articleKey of articleKeys) {
      articleCounts.set(articleKey, (articleCounts.get(articleKey) ?? 0) + 1);
    }
    unique.push(result);
  }

  return unique;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
