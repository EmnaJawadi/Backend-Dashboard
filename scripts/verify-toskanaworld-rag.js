/* eslint-disable no-console */
require('dotenv/config');

const assert = require('node:assert/strict');
const { PrismaService } = require('../dist/src/database/prisma/prisma.service.js');
const { EmbeddingsService } = require('../dist/src/modules/knowledge-base/ingestion/embeddings.service.js');
const { ProductSearchService } = require('../dist/src/modules/products/product-search.service.js');
const { RagService } = require('../dist/src/modules/rag/rag.service.js');
const { RetrievalPolicyService } = require('../dist/src/modules/rag/policies/retrieval-policy.service.js');
const { PgvectorRetriever } = require('../dist/src/modules/rag/retrievers/pgvector.retriever.js');
const { WorkflowAiService } = require('../dist/src/modules/ai/workflow-ai.service.js');
const { TOSKANAWORLD_2026_ARTICLES } = require('../dist/src/modules/knowledge-base/data/toskanaworld-2026-kb.data.js');

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function workflowDecision(message, intent, orderDetails = {}) {
  return {
    normalizedMessage: message,
    detectedLanguage: 'fr',
    intent,
    needsRag: true,
    canAnswer: true,
    handoffRequired: false,
    orderIntent: Object.keys(orderDetails).length > 0,
    orderDetails: {
      actionType: null,
      customerName: null,
      requestedItem: null,
      quantity: null,
      requestedDate: null,
      address: null,
      phone: null,
      notes: null,
      items: [],
      total: null,
      currency: null,
      availability: null,
      confirmationStatus: null,
      missingFields: [],
      checkInDate: null,
      checkOutDate: null,
      numberOfAdults: null,
      numberOfChildren: null,
      childrenAges: null,
      roomType: null,
      ...orderDetails,
    },
    replyDraft: '',
    reply: '',
    keywordsForSearch: [],
    sources: [],
    confidence: 0.9,
    reason: null,
  };
}

async function main() {
  const prisma = new PrismaService();

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
    assert.ok(company, 'ToskanaWorld company not found.');

    const rows = await prisma.$queryRawUnsafe(
      `SELECT a.id, a.title, a.status,
              COUNT(c.id)::int AS chunks,
              COUNT(c.embedding_vector)::int AS embeddings,
              BOOL_AND(c.company_id = a.company_id) AS scope_ok,
              BOOL_AND(vector_dims(c.embedding_vector) = 1536) AS dimensions_ok
       FROM kb_articles a
       LEFT JOIN kb_chunks c ON c.article_id = a.id
       WHERE a.company_id = $1
       GROUP BY a.id
       ORDER BY a.title`,
      company.id,
    );

    assert.equal(rows.length, 12, 'ToskanaWorld must have exactly 12 articles.');
    assert.deepEqual(
      rows.map((row) => row.title).sort(),
      TOSKANAWORLD_2026_ARTICLES.map((article) => article.title).sort(),
      'The published article set must match the official 2026 structure.',
    );
    for (const row of rows) {
      assert.equal(row.status, 'published', `${row.title} is not published.`);
      assert.ok(row.chunks > 0, `${row.title} has no chunks.`);
      assert.equal(row.embeddings, row.chunks, `${row.title} has missing embeddings.`);
      assert.equal(row.scope_ok, true, `${row.title} has a cross-company chunk.`);
      assert.equal(row.dimensions_ok, true, `${row.title} has an invalid embedding.`);
    }

    const retriever = new PgvectorRetriever(prisma, new EmbeddingsService());
    const rag = new RagService(
      retriever,
      new RetrievalPolicyService(),
      new ProductSearchService(prisma),
    );
    const workflow = Object.create(WorkflowAiService.prototype);
    const cases = [
      {
        query: 'Prix chambre standard en juin ?',
        intent: 'PRICE_QUERY',
        expected: ['115 TND'],
        excluded: ['160 TND', '200 TND'],
      },
      {
        query: 'Prix chambre standard en juillet ?',
        intent: 'PRICE_QUERY',
        expected: ['160 TND', '200 TND'],
        excluded: ['115 TND'],
      },
      {
        query: 'Prix Junior Suite en aout ?',
        intent: 'PRICE_QUERY',
        expected: ['1200 TND'],
        excluded: ['700 TND', '950 TND'],
      },
      {
        query: 'Supplement vue mer ?',
        intent: 'BUSINESS_QUERY',
        expected: ['17 TND', '33 TND', '48 TND'],
        excluded: [],
      },
      {
        query: 'Reduction enfant ?',
        intent: 'BUSINESS_QUERY',
        expected: ['50 %', '30 %'],
        excluded: [],
      },
      {
        query: 'Minimum stay ?',
        intent: 'BUSINESS_QUERY',
        expected: ['3 nuits', '4 nuits', '5 nuits'],
        excluded: [],
      },
    ];
    const answers = [];

    for (const item of cases) {
      const result = await rag.query({
        companyId: company.id,
        query: item.query,
        language: 'fr',
        intent: item.intent,
      });
      assert.equal(result.hasReliableSources, true, `No RAG source for: ${item.query}`);
      assert.ok(result.evidences.length > 0, `No evidence for: ${item.query}`);
      assert.ok(
        result.evidences.every(
          (evidence) => evidence.metadata?.companyId === company.id,
        ),
        `Cross-company evidence returned for: ${item.query}`,
      );

      const guarded = workflow.applyFinalKnowledgeGuards(
        workflowDecision(item.query, item.intent),
        item.query,
        result,
      );
      for (const value of item.expected) assert.match(guarded.reply, new RegExp(value));
      for (const value of item.excluded) assert.doesNotMatch(guarded.reply, new RegExp(value));
      assert.ok(guarded.sources.length > 0, `No cited chunks for: ${item.query}`);
      assert.doesNotMatch(
        guarded.reply,
        /Section:|Mots-cles:|ToskanaWorld 2026 -|17\s*000|#{1,6}/i,
      );
      answers.push({ query: item.query, reply: guarded.reply, sources: guarded.sources.length });
    }

    const quoteQuery = 'Prix pour 2 adultes et 1 enfant ?';
    const quoteRag = await rag.query({
      companyId: company.id,
      query: quoteQuery,
      language: 'fr',
      intent: 'PRICE_QUERY',
    });
    const quote = workflow.applyFinalKnowledgeGuards(
      workflowDecision(quoteQuery, 'PRICE_QUERY', {
        actionType: 'reservation',
        numberOfAdults: 2,
        numberOfChildren: 1,
      }),
      quoteQuery,
      quoteRag,
    );
    assert.match(quote.reply, /date d'arrivee/i);
    assert.match(quote.reply, /date de depart/i);
    assert.match(quote.reply, /age de chaque enfant/i);
    assert.match(quote.reply, /type de chambre/i);
    assert.deepEqual(quote.sources, []);
    answers.push({ query: quoteQuery, reply: quote.reply, sources: 0 });

    console.log(
      JSON.stringify(
        {
          companyId: company.id,
          articles: rows.length,
          chunks: rows.reduce((sum, row) => sum + row.chunks, 0),
          embeddings: rows.reduce((sum, row) => sum + row.embeddings, 0),
          answers,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
