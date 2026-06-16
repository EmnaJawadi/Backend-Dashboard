/* eslint-disable no-console */
require('dotenv/config');

const { PrismaService } = require('../dist/src/database/prisma/prisma.service.js');
const { KbRepository } = require('../dist/src/modules/knowledge-base/kb.repository.js');
const { KbMapper } = require('../dist/src/modules/knowledge-base/mappers/kb.mapper.js');
const { ChunkerService } = require('../dist/src/modules/knowledge-base/ingestion/chunker.service.js');
const { EmbeddingsService } = require('../dist/src/modules/knowledge-base/ingestion/embeddings.service.js');
const { IngestionService } = require('../dist/src/modules/knowledge-base/ingestion/ingestion.service.js');
const { UrlParser } = require('../dist/src/modules/knowledge-base/ingestion/parsers/url.parser.js');
const { PdfParser } = require('../dist/src/modules/knowledge-base/ingestion/parsers/pdf.parser.js');
const { DocParser } = require('../dist/src/modules/knowledge-base/ingestion/parsers/doc.parser.js');
const { PptParser } = require('../dist/src/modules/knowledge-base/ingestion/parsers/ppt.parser.js');
const { StructuredDataParser } = require('../dist/src/modules/knowledge-base/ingestion/parsers/structured-data.parser.js');
const { KbArticlesService } = require('../dist/src/modules/knowledge-base/kb-articles.service.js');
const { TOSKANAWORLD_2026_ARTICLES } = require('../dist/src/modules/knowledge-base/data/toskanaworld-2026-kb.data.js');

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

async function main() {
  const prisma = new PrismaService();
  const createdIds = [];

  try {
    await prisma.$connect();
    const companies = await prisma.company.findMany({
      select: { id: true, name: true, legalName: true },
    });
    const company = companies.find((item) =>
      [item.name, item.legalName].some((name) =>
        normalize(name).includes('toskanaworld'),
      ),
    );

    if (!company) {
      throw new Error('ToskanaWorld company not found');
    }

    const oldArticles = await prisma.kbArticle.findMany({
      where: { companyId: company.id },
      select: { id: true, title: true },
    });
    const repository = new KbRepository(prisma);
    const ingestion = new IngestionService(
      new ChunkerService(),
      new EmbeddingsService(),
      new UrlParser(),
      new PdfParser(),
      new DocParser(),
      new PptParser(),
      new StructuredDataParser(),
    );
    const service = new KbArticlesService(
      prisma,
      repository,
      new KbMapper(),
      ingestion,
    );

    for (const definition of TOSKANAWORLD_2026_ARTICLES) {
      const article = await service.create({
        companyId: company.id,
        title: definition.title,
        category: definition.category,
        content: definition.content,
        tags: definition.tags,
        language: 'fr',
        status: 'published',
      });
      createdIds.push(article.id);
    }

    await prisma.kbArticle.updateMany({
      where: { id: { in: createdIds }, companyId: company.id },
      data: { source: 'imported' },
    });

    const verification = await prisma.$queryRawUnsafe(
      `SELECT a.id, a.title, a.status,
              COUNT(c.id)::int AS chunks,
              COUNT(c.embedding_vector)::int AS embeddings,
              BOOL_AND(c.company_id = a.company_id) AS scope_ok
       FROM kb_articles a
       LEFT JOIN kb_chunks c ON c.article_id = a.id
       WHERE a.company_id = $1 AND a.id = ANY($2::text[])
       GROUP BY a.id
       ORDER BY a.title`,
      company.id,
      createdIds,
    );
    const invalid = verification.filter(
      (row) =>
        row.status !== 'published' ||
        row.chunks < 1 ||
        row.embeddings !== row.chunks ||
        row.scope_ok !== true,
    );

    const expectedCount = TOSKANAWORLD_2026_ARTICLES.length;
    if (verification.length !== expectedCount || invalid.length > 0) {
      throw new Error(
        `Replacement verification failed: ${JSON.stringify({ expected: expectedCount, count: verification.length, invalid })}`,
      );
    }

    await prisma.$transaction(async (tx) => {
      if (oldArticles.length > 0) {
        await tx.kbArticle.deleteMany({
          where: {
            companyId: company.id,
            id: { in: oldArticles.map((article) => article.id) },
          },
        });
      }
    });

    console.log(
      JSON.stringify(
        {
          companyId: company.id,
          companyName: company.name,
          removedArticles: oldArticles.length,
          createdArticles: verification.length,
          createdChunks: verification.reduce((sum, row) => sum + row.chunks, 0),
          articles: verification,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (createdIds.length > 0) {
      await prisma.kbArticle.deleteMany({ where: { id: { in: createdIds } } });
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
