import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

export type ProductSearchResult = {
  product: ProductSearchRow;
  score: number;
  confidence: number;
  matchedTokens: string[];
  searchableText: string;
};

export type ProductSearchRow = {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  isAvailable: boolean;
  status: string;
  keywords: string[];
  variants: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  images: Array<{
    id: string;
    imageUrl: string;
    altText: string | null;
    metadata: Prisma.JsonValue | null;
  }>;
};

@Injectable()
export class ProductSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(params: {
    companyId: string;
    query: string;
    limit?: number;
    includeInactive?: boolean;
  }): Promise<ProductSearchResult[]> {
    const companyId = params.companyId?.trim();
    if (!companyId) {
      return [];
    }

    const tokens = this.tokenize(params.query);
    if (tokens.length === 0) {
      return [];
    }

    const rows = await this.prisma.product.findMany({
      where: {
        companyId,
        ...(params.includeInactive ? {} : { status: 'ACTIVE' }),
      },
      take: Math.max((params.limit ?? 10) * 40, 120),
      orderBy: { updatedAt: 'desc' },
      include: {
        images: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return rows
      .map((product) =>
        this.scoreProduct(product as ProductSearchRow, tokens, params.query),
      )
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, params.limit ?? 10);
  }

  productToEvidence(product: ProductSearchRow): string {
    const pieces = [
      `Produit: ${product.name}`,
      product.category ? `Categorie: ${product.category}` : null,
      product.description ? `Description: ${product.description}` : null,
      product.keywords.length ? `Mots-cles: ${product.keywords.join(', ')}` : null,
      product.isAvailable ? 'Disponibilite: disponible' : 'Disponibilite: indisponible',
      product.price !== null
        ? `Prix: ${this.formatPrice(product.price, product.currency)}`
        : 'Prix: non renseigne',
    ];

    return pieces.filter(Boolean).join('\n');
  }

  buildSearchText(product: ProductSearchRow): string {
    return [
      product.name,
      product.description,
      product.category,
      product.keywords.join(' '),
      this.safeJsonToText(product.variants),
      this.safeJsonToText(product.metadata),
      product.images.map((image) => image.altText ?? '').join(' '),
      product.images.map((image) => this.safeJsonToText(image.metadata)).join(' '),
    ]
      .filter(Boolean)
      .join(' ');
  }

  tokenize(value: string): string[] {
    const stopWords = new Set([
      'avec',
      'bonjour',
      'bonsoir',
      'celui',
      'celle',
      'ceci',
      'cela',
      'dans',
      'des',
      'est',
      'je',
      'les',
      'pour',
      'prix',
      'que',
      'quoi',
      'une',
      'vos',
      'vous',
      'veux',
      'votre',
      'combien',
      'coute',
      'svp',
      'please',
      'this',
      'that',
      'with',
    ]);

    const normalized = this.normalize(value);
    const tokens = normalized
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .flatMap((token) =>
        token.length > 4 && token.endsWith('s')
          ? [token, token.slice(0, -1)]
          : [token],
      )
      .filter((token) => [...token].length >= 2 && !stopWords.has(token));

    return Array.from(new Set(tokens.flatMap((token) => [token, ...this.synonyms(token)])));
  }

  normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u064B-\u065F\u0670]/g, '');
  }

  private scoreProduct(
    product: ProductSearchRow,
    queryTokens: string[],
    query: string,
  ): ProductSearchResult {
    const searchableText = this.buildSearchText(product);
    const searchable = this.normalize(searchableText);
    const searchableTokens = new Set(
      searchable
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter(Boolean),
    );
    const matchedTokens = queryTokens.filter((token) => searchableTokens.has(token));
    const tokenScore = matchedTokens.length / Math.max(queryTokens.length, 1);
    const normalizedName = this.normalize(product.name);
    const normalizedCategory = this.normalize(product.category ?? '');
    const normalizedQuery = this.normalize(query);
    const nameBonus = matchedTokens.some((token) => normalizedName.includes(token))
      ? 0.22
      : 0;
    const categoryBonus = matchedTokens.some((token) =>
      normalizedCategory.includes(token),
    )
      ? 0.12
      : 0;
    const phraseBonus =
      normalizedQuery.length >= 8 && searchable.includes(normalizedQuery) ? 0.16 : 0;
    const imageAltBonus =
      product.images.length > 0 &&
      product.images.some((image) =>
        this.normalize(image.altText ?? '').split(/[^\p{L}\p{N}]+/u).some((token) =>
          queryTokens.includes(token),
        ),
      )
        ? 0.08
        : 0;

    const score = Number(
      Math.min(1, tokenScore + nameBonus + categoryBonus + phraseBonus + imageAltBonus).toFixed(3),
    );

    return {
      product,
      score,
      confidence: score,
      matchedTokens,
      searchableText,
    };
  }

  private synonyms(token: string): string[] {
    const map: Record<string, string[]> = {
      cuir: ['leather'],
      leather: ['cuir'],
      marron: ['brun', 'brown'],
      brun: ['marron', 'brown'],
      brown: ['marron', 'brun'],
      noir: ['black'],
      black: ['noir'],
      blanc: ['white'],
      white: ['blanc'],
      rouge: ['red'],
      red: ['rouge'],
      bleu: ['blue'],
      blue: ['bleu'],
      vert: ['green'],
      green: ['vert'],
      sac: ['bag'],
      bag: ['sac'],
      chaussure: ['shoes', 'sneaker'],
      chaussures: ['shoes', 'sneaker'],
      shoes: ['chaussure', 'chaussures'],
      robe: ['dress'],
      dress: ['robe'],
      montre: ['watch'],
      watch: ['montre'],
      disponible: ['stock'],
      disponibilite: ['stock'],
      stock: ['disponible', 'disponibilite'],
    };

    return map[token] ?? [];
  }

  private safeJsonToText(value: Prisma.JsonValue | null): string {
    if (value === null || value === undefined) {
      return '';
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private formatPrice(price: number, currency: string): string {
    const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
    return `${amount} ${currency || 'TND'}`;
  }
}
