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

function readArgument(name) {
  const npmConfigValue = process.env[`npm_config_${name.replace(/-/g, '_')}`];

  if (npmConfigValue?.trim()) {
    return npmConfigValue.trim();
  }

  const normalizedArgs = process.argv.map((value) => value.replace(/\^/g, ''));
  const prefix = `--${name}=`;
  const inlineIndex = normalizedArgs.findIndex((value) => value.startsWith(prefix));

  if (inlineIndex >= 0) {
    return [
      normalizedArgs[inlineIndex].slice(prefix.length),
      ...normalizedArgs
        .slice(inlineIndex + 1)
        .filter((value) => !value.startsWith('--')),
    ]
      .join(' ')
      .trim();
  }

  const index = normalizedArgs.indexOf(`--${name}`);
  return index >= 0 ? String(normalizedArgs[index + 1] ?? '').trim() : '';
}

async function main() {
  const companyName = readArgument('company');

  if (!companyName) {
    throw new Error(
      'Missing --company. Example: npm run kb:rebuild -- --company="Toskana World"',
    );
  }

  const prisma = new PrismaService();

  try {
    await prisma.$connect();
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
    const report = await service.rebuildCompanyKbByName(companyName);

    console.log('\nKnowledge base rebuild report');
    console.table({
      companyId: report.companyId,
      companyName: report.companyName,
      articlesFound: report.articlesFound,
      articlesIndexed: report.articlesIndexed,
      chunksDeleted: report.chunksDeleted,
      chunksCreated: report.chunksCreated,
      errors: report.errors.length,
    });

    if (report.errors.length > 0) {
      console.error(JSON.stringify(report.errors, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
