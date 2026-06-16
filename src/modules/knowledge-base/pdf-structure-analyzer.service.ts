import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from '../ai/providers/ai-provider.service';
import {
  buildToskanaworld2026Articles,
  parseToskanaworld2026PdfData,
} from './data/toskanaworld-2026-kb.data';

export interface PdfArticleDraft {
  title: string;
  category: string;
  body: string;
  tags: string[];
}

const SYSTEM_PROMPT = `Tu es un expert en structuration de documents. On te donne le contenu brut d'un PDF professionnel (catalogue produits, FAQ, politique, tarifs, etc.).

Tu dois :
1. Identifier toutes les sections logiques du document.
   Chaque section doit traiter UN SEUL sujet distinct.
   Une section = un futur article dans une base de connaissances IA.

2. Pour chaque tableau detecte dans le texte brut :
   - Identifier les colonnes et les lignes
   - Convertir CHAQUE LIGNE en une phrase narrative complete en francais
   - Exemple : tableau [Produit | Taille | Prix] avec ligne [Chemise | M | 500 DZD]
     devient : "Le produit Chemise est disponible en taille M au prix de 500 DZD."
   - Ne jamais laisser un tableau sous forme de texte tabulaire brut

3. Retourner UNIQUEMENT un JSON valide, sans markdown, sans backticks, sans texte avant ou apres.

Format JSON attendu :
{
  "articles": [
    {
      "title": "Titre court et descriptif de la section (max 80 caracteres)",
      "category": "Categorie suggeree parmi : Produits, Tarifs, FAQ, Politique, Livraison, Services, General",
      "body": "Contenu complet de la section en texte clair. Les tableaux sont convertis en phrases narratives. Le texte doit etre autonome et comprehensible sans contexte.",
      "tags": ["tag1", "tag2"]
    }
  ]
}`;

@Injectable()
export class PdfStructureAnalyzerService {
  private readonly logger = new Logger(PdfStructureAnalyzerService.name);

  constructor(private readonly aiProviderService: AiProviderService) {}

  async analyzeAndSplit(rawText: string, companyId: string): Promise<PdfArticleDraft[]> {
    const toskanaworldData = parseToskanaworld2026PdfData(rawText);

    if (toskanaworldData) {
      const articles = buildToskanaworld2026Articles(toskanaworldData);
      this.logger.log(
        `PDF_ANALYZER_TOSKANAWORLD_2026 companyId=${companyId} articles=${articles.length}`,
      );
      return articles.map((article) => ({
        title: article.title,
        category: article.category,
        body: article.content,
        tags: article.tags,
      }));
    }

    const truncatedText = rawText.slice(0, 24000);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const answer = await this.aiProviderService.generateAnswer({
          systemPrompt: SYSTEM_PROMPT,
          userMessage: `Voici le contenu brut du PDF a analyser et structurer :\n\n${truncatedText}`,
          companyId,
          temperature: 0.1,
          maxOutputTokens: 8000,
        });

        const parsed = this.parseJsonResponse(answer.text);
        if (parsed) {
          this.logger.log(
            `PDF_ANALYZER_SUCCESS companyId=${companyId} articles=${parsed.length} attempt=${attempt}`,
          );
          return parsed;
        }

        this.logger.warn(
          `PDF_ANALYZER_INVALID_JSON companyId=${companyId} attempt=${attempt} responseLength=${answer.text.length}`,
        );
      } catch (error) {
        this.logger.error(
          `PDF_ANALYZER_ERROR companyId=${companyId} attempt=${attempt} error=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.warn(
      `PDF_ANALYZER_FALLBACK companyId=${companyId} — returning raw text as single article`,
    );

    return [
      {
        title: 'Document importe',
        category: 'General',
        body: rawText,
        tags: [],
      },
    ];
  }

  private parseJsonResponse(text: string): PdfArticleDraft[] | null {
    try {
      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed: unknown = JSON.parse(cleaned);

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('articles' in parsed) ||
        !Array.isArray((parsed as { articles: unknown }).articles)
      ) {
        return null;
      }

      const articles = (parsed as { articles: unknown[] }).articles;

      const validated: PdfArticleDraft[] = [];

      for (const item of articles) {
        if (!item || typeof item !== 'object') continue;

        const a = item as Record<string, unknown>;
        const title = typeof a['title'] === 'string' ? a['title'].trim() : '';
        const category = typeof a['category'] === 'string' ? a['category'].trim() : 'General';
        const body = typeof a['body'] === 'string' ? a['body'].trim() : '';
        const tags = Array.isArray(a['tags'])
          ? (a['tags'] as unknown[]).filter((t): t is string => typeof t === 'string')
          : [];

        if (title && body) {
          validated.push({ title, category, body, tags });
        }
      }

      return validated.length > 0 ? validated : null;
    } catch {
      return null;
    }
  }
}
