import assert from 'node:assert/strict';

require('dotenv/config');

const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/src/generated/prisma/client.js');
const { RagService } = require('../dist/src/modules/rag/rag.service.js');
const { PgvectorRetriever } = require(
  '../dist/src/modules/rag/retrievers/pgvector.retriever.js'
);
const { RetrievalPolicyService } = require(
  '../dist/src/modules/rag/policies/retrieval-policy.service.js'
);
const { ProductSearchService } = require(
  '../dist/src/modules/products/product-search.service.js'
);
const { EmbeddingsService } = require(
  '../dist/src/modules/knowledge-base/ingestion/embeddings.service.js'
);

const connectionString = process.env.DATABASE_URL;

assert.ok(connectionString, 'DATABASE_URL is required for the FlavoNation KB RAG test.');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const rag = new RagService(
  new PgvectorRetriever(prisma, new EmbeddingsService()),
  new RetrievalPolicyService(),
  new ProductSearchService(prisma),
);

type ExpectedAnswer = {
  label: string;
  query: string;
  intent: string;
  expected: RegExp;
};

const EXPECTED_ANSWERS: ExpectedAnswer[] = [
  {
    label: 'prix pizza',
    query: 'prix pizza',
    intent: 'PRICE_QUERY',
    expected: /(pizza[\s\S]{0,120}20 TND|20 TND[\s\S]{0,120}pizza)/i,
  },
  {
    label: 'prix couscous',
    query: 'prix couscous tunisien',
    intent: 'PRICE_QUERY',
    expected: /(couscous tunisien[\s\S]{0,120}18 TND|18 TND[\s\S]{0,120}couscous tunisien)/i,
  },
  {
    label: 'boissons',
    query: 'boissons disponibles et prix',
    intent: 'AVAILABILITY_QUERY',
    expected: /boissons[\s\S]{0,180}(pas document|verifier)/i,
  },
  {
    label: 'livraison',
    query: 'livraison Tunis Aouina adresse',
    intent: 'DELIVERY_COVERAGE_QUERY',
    expected: /(Tunis Aouina|Grand Tunis)/i,
  },
  {
    label: 'commande',
    query: 'processus commande WhatsApp nom telephone adresse quantites',
    intent: 'ORDER_INTENT',
    expected: /(nom du client|telephone)[\s\S]{0,240}(quantites|confirmation explicite)/i,
  },
  {
    label: 'confirmation',
    query: 'confirmation explicite commande recapitulatif',
    intent: 'ORDER_INTENT',
    expected: /(confirmation explicite|confirmer la commande)[\s\S]{0,200}recapitulatif/i,
  },
];

async function run() {
  const company = await prisma.company.findUnique({
    where: { name: 'FlavoNation' },
    select: { id: true },
  });

  assert.ok(
    company,
    'FlavoNation is missing from the database. Run npm run kb:seed:flavonation first.',
  );

  for (const expectation of EXPECTED_ANSWERS) {
    const result = await rag.query({
      companyId: company.id,
      query: expectation.query,
      intent: expectation.intent,
    });

    assert.equal(
      result.hasReliableSources,
      true,
      `No reliable KB source retrieved for: ${expectation.label}`,
    );
    assert.ok(result.evidences.length > 0, `No evidence retrieved for: ${expectation.label}`);
    assert.ok(
      result.evidences.every(
        (evidence: { metadata?: Record<string, unknown> }) =>
          evidence.metadata?.companyId === company.id,
      ),
      `Cross-company evidence retrieved for: ${expectation.label}`,
    );

    const content = result.evidences.map((evidence: { content: string }) => evidence.content).join('\n');
    assert.match(content, expectation.expected, `KB answer not confirmed for: ${expectation.label}`);
  }

  console.log('FlavoNation KB/RAG checks passed: pizza, couscous, boissons, livraison, commande, confirmation.');
}

run()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
