import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiService } from '../../integrations/gemini/gemini.service';
import {
  ProductSearchResult,
  ProductSearchService,
} from './product-search.service';

export type ProductImageAnalysisResult = {
  detectedObject: string | null;
  color: string | null;
  material: string | null;
  visibleBrand: string | null;
  visibleText: string | null;
  distinctiveFeatures: string[];
  keywords: string[];
  confidence: number;
  rawText: string | null;
};

export type ProductMatchResult = {
  analysis: ProductImageAnalysisResult;
  query: string;
  candidates: Array<{
    productId: string;
    name: string;
    score: number;
    confidence: number;
    matchedTokens: string[];
  }>;
  match: ProductSearchResult | null;
  confidence: number;
  reliable: boolean;
  reason: string;
};

type ImagePart = {
  source: string;
  mimeType: string;
  data?: string;
  mediaUrl?: string;
};

@Injectable()
export class ProductVisionService {
  private readonly logger = new Logger(ProductVisionService.name);

  constructor(
    private readonly geminiService: GeminiService,
    private readonly productSearchService: ProductSearchService,
    private readonly configService: ConfigService,
  ) {}

  async analyzeAndMatch(input: {
    companyId: string;
    caption?: string | null;
    mediaUrl?: string | null;
    mediaId?: string | null;
    rawPayload?: Record<string, unknown>;
  }): Promise<ProductMatchResult> {
    const analysis = await this.analyzeImage(input);
    const query = this.buildProductQuery(analysis, input.caption);
    const candidates = await this.productSearchService.searchProducts({
      companyId: input.companyId,
      query,
      limit: 5,
    });
    const top = candidates[0] ?? null;
    const confidence = top
      ? Number(Math.min(1, top.score * 0.72 + analysis.confidence * 0.28).toFixed(2))
      : 0;
    const minConfidence = this.getMinConfidence();
    const reliable =
      Boolean(top) &&
      confidence >= minConfidence &&
      top.score >= 0.45 &&
      analysis.confidence >= 0.35;

    return {
      analysis,
      query,
      candidates: candidates.map((candidate) => ({
        productId: candidate.product.id,
        name: candidate.product.name,
        score: candidate.score,
        confidence: candidate.confidence,
        matchedTokens: candidate.matchedTokens,
      })),
      match: reliable ? top : null,
      confidence,
      reliable,
      reason: reliable ? 'product_match_reliable' : 'product_image_uncertain',
    };
  }

  private async analyzeImage(input: {
    caption?: string | null;
    mediaUrl?: string | null;
    mediaId?: string | null;
    rawPayload?: Record<string, unknown>;
  }): Promise<ProductImageAnalysisResult> {
    const imagePart = this.extractImagePart(input);

    if (!imagePart) {
      this.logger.warn(
        `PRODUCT_VISION_NO_IMAGE_REFERENCE mediaId=${input.mediaId ?? 'null'} captionLength=${input.caption?.length ?? 0}`,
      );

      return {
        detectedObject: null,
        color: null,
        material: null,
        visibleBrand: null,
        visibleText: null,
        distinctiveFeatures: [],
        keywords: this.productSearchService.tokenize(input.caption ?? ''),
        confidence: input.caption?.trim() ? 0.25 : 0,
        rawText: null,
      };
    }

    try {
      const result = await this.geminiService.generateImageUnderstanding({
        prompt: [
          'Analyse cette image WhatsApp d un client pour retrouver un produit dans une base de donnees.',
          'Ne devine jamais le nom exact du produit, le prix, la disponibilite ou des caracteristiques commerciales.',
          'Decris seulement ce qui est visible dans l image.',
          'Retourne uniquement un JSON strict avec les cles suivantes:',
          'detectedObject, color, material, visibleBrand, visibleText, distinctiveFeatures, keywords, confidence.',
          'confidence doit etre un nombre entre 0 et 1.',
          input.caption?.trim()
            ? `Caption client: ${input.caption.trim()}`
            : 'Caption client: aucune',
        ].join('\n'),
        mimeType: imagePart.mimeType,
        data: imagePart.data,
        mediaUrl: imagePart.mediaUrl,
        model: 'gemini-2.5-flash',
        temperature: 0.1,
        maxOutputTokens: 450,
      });

      return this.parseAnalysis(result.text);
    } catch (error) {
      this.logger.warn(
        `PRODUCT_VISION_ANALYSIS_FAILED source=${imagePart.source} error=${error instanceof Error ? error.message : 'unknown'}`,
      );

      return {
        detectedObject: null,
        color: null,
        material: null,
        visibleBrand: null,
        visibleText: null,
        distinctiveFeatures: [],
        keywords: this.productSearchService.tokenize(input.caption ?? ''),
        confidence: input.caption?.trim() ? 0.25 : 0,
        rawText: null,
      };
    }
  }

  private buildProductQuery(
    analysis: ProductImageAnalysisResult,
    caption?: string | null,
  ): string {
    return [
      analysis.detectedObject,
      analysis.color,
      analysis.material,
      analysis.visibleBrand,
      analysis.visibleText,
      ...analysis.distinctiveFeatures,
      ...analysis.keywords,
      caption,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ');
  }

  private parseAnalysis(rawText: string): ProductImageAnalysisResult {
    const fallback: ProductImageAnalysisResult = {
      detectedObject: null,
      color: null,
      material: null,
      visibleBrand: null,
      visibleText: null,
      distinctiveFeatures: [],
      keywords: this.productSearchService.tokenize(rawText),
      confidence: 0.35,
      rawText,
    };

    try {
      const parsed = JSON.parse(this.normalizeJsonText(rawText)) as Record<
        string,
        unknown
      >;

      return {
        detectedObject: this.asString(parsed.detectedObject),
        color: this.asString(parsed.color),
        material: this.asString(parsed.material),
        visibleBrand: this.asString(parsed.visibleBrand),
        visibleText: this.asString(parsed.visibleText),
        distinctiveFeatures: this.asStringArray(parsed.distinctiveFeatures),
        keywords: this.asStringArray(parsed.keywords),
        confidence: this.clampConfidence(parsed.confidence),
        rawText,
      };
    } catch {
      return fallback;
    }
  }

  private extractImagePart(input: {
    mediaUrl?: string | null;
    rawPayload?: Record<string, unknown>;
  }): ImagePart | null {
    const rawPayload = input.rawPayload ?? {};
    const imageMessage = this.findNestedRecord(rawPayload, 'imageMessage');
    const mediaUrl = input.mediaUrl?.trim() || null;
    const candidates = [
      mediaUrl,
      imageMessage?.jpegThumbnail,
      imageMessage?.base64,
      imageMessage?.media,
      imageMessage?.url,
      imageMessage?.directPath,
      this.findNestedValue(rawPayload, 'mediaUrl'),
      this.findNestedValue(rawPayload, 'media_url'),
      this.findNestedValue(rawPayload, 'url'),
    ];
    const mimeType =
      this.findNestedString(rawPayload, 'mimetype') ??
      this.findNestedString(rawPayload, 'mimeType') ??
      'image/jpeg';

    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        continue;
      }

      const value = candidate.trim();
      if (/^https?:\/\//i.test(value)) {
        return { source: 'media_url', mimeType, mediaUrl: value };
      }

      const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/i);
      if (dataUrlMatch?.[2]) {
        return {
          source: 'data_url',
          mimeType: dataUrlMatch[1] || mimeType,
          data: dataUrlMatch[2],
        };
      }

      if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 80) {
        return {
          source: 'inline_base64',
          mimeType,
          data: value.replace(/\s+/g, ''),
        };
      }
    }

    return null;
  }

  private findNestedRecord(
    value: unknown,
    key: string,
  ): Record<string, unknown> | null {
    const found = this.findNestedValue(value, key);
    return found && typeof found === 'object' && !Array.isArray(found)
      ? (found as Record<string, unknown>)
      : null;
  }

  private findNestedString(value: unknown, key: string): string | null {
    const found = this.findNestedValue(value, key);
    return typeof found === 'string' && found.trim() ? found.trim() : null;
  }

  private findNestedValue(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object') {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findNestedValue(item, key);
        if (found !== null && found !== undefined) return found;
      }
      return null;
    }

    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }

    for (const nested of Object.values(record)) {
      const found = this.findNestedValue(nested, key);
      if (found !== null && found !== undefined) return found;
    }

    return null;
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  private clampConfidence(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Number(Math.max(0, Math.min(1, value)).toFixed(2))
      : 0.5;
  }

  private normalizeJsonText(rawText: string): string {
    const trimmed = rawText.trim();
    const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fencedMatch?.[1]?.trim() ?? trimmed;
  }

  private getMinConfidence(): number {
    const raw = Number(
      this.configService.get<string>('PRODUCT_IMAGE_MATCH_MIN_CONFIDENCE') ?? '0.62',
    );

    return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.62;
  }

}
