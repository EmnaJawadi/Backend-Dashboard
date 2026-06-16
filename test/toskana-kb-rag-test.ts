import assert from 'node:assert/strict';

const { KbArticlesService } = require(
  '../dist/src/modules/knowledge-base/kb-articles.service.js',
);
const { IngestionService } = require(
  '../dist/src/modules/knowledge-base/ingestion/ingestion.service.js',
);
const { ChunkerService } = require(
  '../dist/src/modules/knowledge-base/ingestion/chunker.service.js',
);
const { EmbeddingsService } = require(
  '../dist/src/modules/knowledge-base/ingestion/embeddings.service.js',
);
const { UrlParser } = require(
  '../dist/src/modules/knowledge-base/ingestion/parsers/url.parser.js',
);
const { PdfParser } = require(
  '../dist/src/modules/knowledge-base/ingestion/parsers/pdf.parser.js',
);
const { DocParser } = require(
  '../dist/src/modules/knowledge-base/ingestion/parsers/doc.parser.js',
);
const { PptParser } = require(
  '../dist/src/modules/knowledge-base/ingestion/parsers/ppt.parser.js',
);
const { StructuredDataParser } = require(
  '../dist/src/modules/knowledge-base/ingestion/parsers/structured-data.parser.js',
);
const { PgvectorRetriever } = require(
  '../dist/src/modules/rag/retrievers/pgvector.retriever.js',
);
const { AiService } = require('../dist/src/modules/ai/ai.service.js');
const { deduplicateRagResults } = require(
  '../dist/src/modules/rag/utils/deduplicate-rag-results.js',
);
const { TOSKANAWORLD_2026_ARTICLES } = require(
  '../dist/src/modules/knowledge-base/data/toskanaworld-2026-kb.data.js',
);

const TOSKANA_COMPANY_ID = 'company-toskana';
const OTHER_COMPANY_ID = 'company-other';
const ARTICLE_BODY = [
  'Informations generales hotel: ToskanaWorld Beach Resort Hammamet, tarifs 2026, formule All Inclusive Soft, facturation par personne PAX.',
  'Tarifs Standard Room STR: P1 du 01/06 au 30/06 = 115 TND, P2 du 01/07 au 15/07 = 160 TND, P3 du 16/07 au 31/08 = 200 TND, P4 du 01/09 au 20/09 = 160 TND, P5 du 21/09 au 31/10 = 115 TND.',
  'Reductions enfants: les reductions dependent de l age de chaque enfant.',
].join('\n\n');

function createIngestionService() {
  const embeddingConfig = {
    get: (key: string) =>
      ({ EMBEDDING_PROVIDER: 'openai-compatible', EMBEDDING_BATCH_SIZE: 16 })[
        key
      ],
  };
  const testEmbeddingProvider = {
    name: 'deterministic-test-provider',
    generate: async (texts: string[], dimensions: number) =>
      texts.map((text) => {
        const vector = Array.from({ length: dimensions }, () => 0);
        for (let index = 0; index < text.length; index += 1) {
          vector[text.charCodeAt(index) % dimensions] += 1;
        }
        return vector;
      }),
  };

  return new IngestionService(
    new ChunkerService(),
    new EmbeddingsService(
      embeddingConfig,
      testEmbeddingProvider,
      testEmbeddingProvider,
    ),
    new UrlParser(),
    new PdfParser(),
    new DocParser(),
    new PptParser(),
    new StructuredDataParser(),
  );
}

function createLifecycleHarness() {
  let sequence = 0;
  const articles = new Map<string, Record<string, any>>();
  const chunks = new Map<string, Array<Record<string, any>>>();
  const repository = {
    createArticle: async (data: Record<string, any>) => {
      const id = `article-${++sequence}`;
      const now = new Date();
      const article = {
        id,
        ...data,
        createdAt: now,
        updatedAt: now,
        company: {
          id: data.companyId,
          name: 'Toskana World',
          legalName: 'ToskanaWorld Beach Resort Hammamet',
        },
        chunks: [],
      };
      articles.set(id, article);
      return article;
    },
    findById: async (id: string, companyId?: string) => {
      const article = articles.get(id);
      if (!article || (companyId && article.companyId !== companyId)) return null;
      return { ...article, chunks: chunks.get(id) ?? [] };
    },
    updateArticle: async (id: string, data: Record<string, any>) => {
      const article = articles.get(id);
      assert.ok(article);
      const updated = { ...article, ...data, updatedAt: new Date() };
      articles.set(id, updated);
      return updated;
    },
    replaceChunksByArticleId: async (
      articleId: string,
      nextChunks: Array<Record<string, any>>,
      companyId: string,
    ) => {
      const article = articles.get(articleId);
      assert.equal(article?.companyId, companyId);
      chunks.set(
        articleId,
        nextChunks.map((chunk, index) => ({
          id: `${articleId}-chunk-${index}`,
          articleId,
          companyId,
          chunkText: chunk.content,
          chunkIndex: chunk.chunkIndex,
          metadataJson: chunk.metadata,
          embedding: chunk.embedding,
        })),
      );
    },
    deleteChunksByArticleId: async (articleId: string, companyId: string) => {
      assert.equal(articles.get(articleId)?.companyId, companyId);
      const count = chunks.get(articleId)?.length ?? 0;
      chunks.delete(articleId);
      return { count };
    },
    deleteArticle: async (articleId: string, companyId: string) => {
      assert.equal(articles.get(articleId)?.companyId, companyId);
      chunks.delete(articleId);
      const article = articles.get(articleId);
      articles.delete(articleId);
      return article;
    },
  };
  const mapper = { toArticleEntity: (article: unknown) => article };
  const service = new KbArticlesService(
    {} as never,
    repository as never,
    mapper as never,
    createIngestionService(),
  );
  const actor = {
    sub: 'admin-toskana',
    email: 'admin@toskana.test',
    role: 'COMPANY_ADMIN',
    companyId: TOSKANA_COMPANY_ID,
  };

  return { service, actor, articles, chunks };
}

async function verifyArticleLifecycle() {
  const harness = createLifecycleHarness();
  const created = await harness.service.create(
    {
      title: 'Tarifs 2026 ToskanaWorld',
      content: ARTICLE_BODY,
      language: 'fr',
      tags: ['tarifs', 'hotel', 'toskana'],
    },
    harness.actor,
  );
  const createdChunks = harness.chunks.get(created.id) ?? [];

  assert.ok(createdChunks.length >= 3, 'Sections should produce separate chunks.');
  assert.ok(createdChunks.every((chunk) => chunk.companyId === TOSKANA_COMPANY_ID));
  assert.ok(createdChunks.every((chunk) => chunk.embedding.length === 1536));
  assert.ok(
    createdChunks.every((chunk) =>
      chunk.chunkText.includes('ToskanaWorld Beach Resort Hammamet'),
    ),
    'Every chunk must carry standalone hotel context.',
  );

  await harness.service.update(
    created.id,
    {
      content:
        'Tarifs Prestige Room 2026: P1 = 147 TND, P2 = 200 TND, P3 = 253 TND.\n\nSejour minimum: 5 nuits en P3.',
    },
    harness.actor,
  );
  const updatedChunks = harness.chunks.get(created.id) ?? [];
  assert.ok(updatedChunks.length > 0);
  assert.ok(updatedChunks.every((chunk) => !chunk.chunkText.includes('115 TND')));
  assert.ok(updatedChunks.some((chunk) => chunk.chunkText.includes('Prestige Room')));

  await harness.service.remove(created.id, harness.actor);
  assert.equal(harness.articles.has(created.id), false);
  assert.equal(harness.chunks.has(created.id), false);
}

async function verifyStructuredImports() {
  const parser = new StructuredDataParser();
  const json = parser.parse(
    Buffer.from(JSON.stringify({ room: 'Standard Room', P1: '115 TND' })),
    'json',
    'rates.json',
  );
  const yaml = parser.parse(
    Buffer.from('room: Prestige Room\nP1: 145 TND\nP2: 190 TND'),
    'yaml',
    'rates.yaml',
  );

  assert.match(json, /room: Standard Room/);
  assert.match(json, /P1: 115 TND/);
  assert.match(yaml, /room: Prestige Room/);
  assert.match(yaml, /P2: 190 TND/);
}

function retrieverChunk(companyId: string, id: string) {
  return {
    id,
    companyId,
    articleId: `article-${companyId}`,
    chunkIndex: 0,
    chunkText:
      'ToskanaWorld Beach Resort Hammamet tarifs 2026 prix tarif reservation booking Standard Room 115 TND.',
    metadataJson: null,
    article: {
      companyId,
      title: 'Tarifs 2026 ToskanaWorld',
      category: 'PRIX',
      tags: ['hotel', 'tarifs'],
      language: 'fr',
      status: 'published',
      sourceUrl: null,
    },
  };
}

async function verifyMultilingualRetrievalAndIsolation() {
  const allChunks = [
    retrieverChunk(TOSKANA_COMPANY_ID, 'chunk-toskana'),
    retrieverChunk(OTHER_COMPANY_ID, 'chunk-other'),
  ];
  const retriever = new PgvectorRetriever(
    {
      $queryRaw: async () => [],
      kbChunk: {
        findMany: async ({ where }: { where: Record<string, any> }) => {
          const serialized = JSON.stringify(where);
          const companyId = serialized.includes(TOSKANA_COMPANY_ID)
            ? TOSKANA_COMPANY_ID
            : OTHER_COMPANY_ID;
          return allChunks.filter((chunk) => chunk.companyId === companyId);
        },
      },
    } as never,
    { generateEmbedding: async () => Array.from({ length: 1536 }, () => 0) } as never,
  );

  const priceResults = await retriever.retrieve(
    'نحب نعرف التكلفة ممكن؟',
    8,
    { companyId: TOSKANA_COMPANY_ID },
  );
  const bookingResults = await retriever.retrieve('ممكن تعدي حجز؟', 8, {
    companyId: TOSKANA_COMPANY_ID,
  });
  const otherResults = await retriever.retrieve('نحب نعرف التكلفة ممكن؟', 8, {
    companyId: OTHER_COMPANY_ID,
  });

  assert.equal(priceResults[0]?.metadata?.chunkId, 'chunk-toskana');
  assert.equal(bookingResults[0]?.metadata?.chunkId, 'chunk-toskana');
  assert.ok(priceResults[0].score >= 0.35);
  assert.ok(bookingResults[0].score >= 0.35);
  assert.ok(
    otherResults.every(
      (result: { metadata?: Record<string, unknown> }) =>
        result.metadata?.companyId === OTHER_COMPANY_ID,
    ),
  );
}

function verifyAgentAsksForStayDetails() {
  const service = Object.create(AiService.prototype) as any;
  const decision = {
    normalizedMessage: 'Je souhaite faire une reservation et connaitre le prix.',
    detectedLanguage: 'tunisian_arabic',
    intent: 'RESERVATION_REQUEST',
    needsRag: true,
    canAnswer: true,
    handoffRequired: true,
    orderIntent: true,
    orderDetails: {},
    replyDraft: 'الأسعار موجودة حسب الفترة ونوع الغرفة.',
    reply: 'الأسعار موجودة حسب الفترة ونوع الغرفة.',
    keywordsForSearch: [],
    sources: ['chunk-toskana'],
    confidence: 0.9,
    reason: null,
  };
  const rag = {
    hasReliableSources: true,
    evidences: [
      {
        id: 'chunk-toskana',
        content:
          'ToskanaWorld Beach Resort Hammamet hotel Standard Room prix 115 TND.',
      },
    ],
  };
  const guarded = service.ensureHospitalityBookingGuidance(
    decision,
    'ممكن تعدي حجز؟',
    rag,
  );

  assert.equal(guarded.canAnswer, true);
  assert.equal(guarded.handoffRequired, false);
  assert.match(guarded.reply, /تاريخ الدخول والخروج/);
  assert.match(guarded.reply, /عدد الأطفال وأعمارهم/);
}

// Test 1: "Bonjour" → needsRag=false, no KB triggered
function verifyGreetingSkipsRag() {
  const service = Object.create(AiService.prototype) as any;

  const socialMessages = [
    'bonjour',
    'salut',
    'slt',
    'merci',
    'bonsoir',
    'hello',
    'Aaslama',
  ];
  for (const msg of socialMessages) {
    const isSocial = service.requiresCompanyKnowledge(msg, 'GREETING');
    assert.equal(
      isSocial,
      false,
      `requiresCompanyKnowledge should be false for social message: "${msg}"`,
    );
  }

  // Also verify isOrderContinuation doesn't fire for pure greetings
  for (const msg of socialMessages) {
    const isContinuation = service.isOrderContinuation(msg);
    assert.equal(
      isContinuation,
      false,
      `isOrderContinuation should be false for social message: "${msg}"`,
    );
  }

  const guarded = service.applyBusinessAndOrderGuards(
    workflowDecision({
      normalizedMessage: 'Aaslama',
      detectedLanguage: 'tunisian_arabic_latin',
      intent: 'GREETING',
      needsRag: true,
    }),
    'Aaslama',
    null,
  );
  assert.equal(guarded.needsRag, false);
  assert.equal(guarded.canAnswer, true);
  assert.match(guarded.reply, /Aaslama/);
}

function workflowDecision(overrides: Record<string, unknown> = {}) {
  return {
    normalizedMessage: '',
    detectedLanguage: 'fr',
    intent: 'BUSINESS_QUERY',
    needsRag: true,
    canAnswer: true,
    handoffRequired: false,
    orderIntent: false,
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
    },
    replyDraft: '',
    reply: '',
    keywordsForSearch: [],
    sources: [],
    confidence: 0.9,
    reason: null,
    ...overrides,
  };
}

function ragResult(evidences: Array<Record<string, any>>) {
  return {
    answer: '',
    context: '',
    sources: evidences.map((evidence) => evidence.id),
    confidence: 0.9,
    hasReliableSources: evidences.length > 0,
    evidences,
    sourceChunkIds: evidences.map((evidence) => evidence.id),
    sourceArticleIds: Array.from(
      new Set(evidences.map((evidence) => evidence.metadata?.articleId)),
    ).filter(Boolean),
    retrievedChunksPreview: [],
  };
}

function verifyRagResultsAreDeduplicatedAndLimited() {
  const title = 'TOSKANA WORLD. Tarifs B2C 2026 - Tarification des chambres';
  const results = deduplicateRagResults(
    [
      {
        content: 'Standard Room: P1 = 115 TND.',
        score: 0.95,
        metadata: { chunkId: 'chunk-1', articleId: 'article-1', articleTitle: title },
      },
      {
        content: 'Standard Room: P1 = 115 TND.',
        score: 0.94,
        metadata: { chunkId: 'chunk-duplicate', articleId: 'article-1', articleTitle: title },
      },
      {
        content: 'Prestige Room: P1 = 145 TND.',
        score: 0.93,
        metadata: { chunkId: 'chunk-2', articleId: 'article-1', articleTitle: title },
      },
      {
        content: 'Family Room: P1 = 165 TND.',
        score: 0.92,
        metadata: { chunkId: 'chunk-3', articleId: 'article-1', articleTitle: title },
      },
    ],
    2,
  );

  assert.equal(results.length, 2, 'At most two unique chunks must remain per article.');
  assert.deepEqual(
    results.map((result: { metadata: { chunkId: string } }) => result.metadata.chunkId),
    ['chunk-1', 'chunk-2'],
  );
}

function verifyRoomTypesUseChunkContent() {
  const service = Object.create(AiService.prototype) as any;
  const decision = workflowDecision({
    normalizedMessage: 'Aatini types chambre existe',
    detectedLanguage: 'tunisian_arabic_latin',
    intent: 'ROOM_TYPES_QUERY',
    reply: 'Types de chambres',
  });
  const rag = ragResult([
    {
      id: 'room-types-1',
      content:
        'Les types proposes sont Chambres Standard, Chambres Prestige, Chambres Familiales et Junior Suites.',
      score: 0.95,
      metadata: {
        articleId: 'room-types',
        articleTitle: 'TOSKANA WORLD. Types de chambres',
      },
    },
  ]);

  const guarded = service.applyFinalKnowledgeGuards(
    decision,
    'Aatini types chambre existe',
    rag,
  );

  assert.match(guarded.reply, /Chambres Standard/);
  assert.match(guarded.reply, /Chambres Prestige/);
  assert.match(guarded.reply, /Chambres Familiales/);
  assert.match(guarded.reply, /Junior Suites/);
  assert.doesNotMatch(guarded.reply, /TOSKANA WORLD/);
}

function verifyAvailabilityDatesNeedRealCalendar() {
  const service = Object.create(AiService.prototype) as any;
  const decision = workflowDecision({
    normalizedMessage: 'Donnez-moi les dates disponibles',
    intent: 'AVAILABILITY_QUERY',
  });
  const rag = ragResult([
    {
      id: 'tariff-periods-1',
      content:
        'Tarifs Standard Room: du 01/06 au 30/06 = 115 TND et du 01/07 au 15/07 = 160 TND.',
      score: 0.9,
      metadata: {
        articleId: 'tariffs',
        articleTitle: 'Tarifs B2C 2026',
      },
    },
  ]);

  const guarded = service.applyFinalKnowledgeGuards(
    decision,
    'Aatini les dates disponibles',
    rag,
  );

  assert.equal(
    guarded.reply,
    "Les dates disponibles ne sont pas pr\u00e9cis\u00e9es dans les informations disponibles. Indiquez vos dates d'arriv\u00e9e et de d\u00e9part pour v\u00e9rifier la disponibilit\u00e9.",
  );
  assert.equal(guarded.handoffRequired, false);
  assert.deepEqual(guarded.sources, []);
}

function verifyB2cTariffsUseExactDeduplicatedFacts() {
  const service = Object.create(AiService.prototype) as any;
  const title = 'TOSKANA WORLD. Tarifs B2C 2026 - Tarification des chambres';
  const deduplicated = deduplicateRagResults([
    {
      id: 'tariff-1',
      content: `${title}\nStandard Room: P1 du 01/06 au 30/06 = 115 TND.`,
      score: 0.96,
      metadata: { articleId: 'tariffs', articleTitle: title },
    },
    {
      id: 'tariff-duplicate',
      content: `${title}\nStandard Room: P1 du 01/06 au 30/06 = 115 TND.`,
      score: 0.95,
      metadata: { articleId: 'tariffs', articleTitle: title },
    },
    {
      id: 'tariff-2',
      content: `${title}\nPrestige Room: P1 du 01/06 au 30/06 = 145 TND.`,
      score: 0.94,
      metadata: { articleId: 'tariffs', articleTitle: title },
    },
  ]);
  const decision = workflowDecision({
    normalizedMessage: 'Tarifs b2c',
    intent: 'PRICE_QUERY',
    reply: `${title}\n${title}\n${title}`,
    sources: ['tariff-1', 'tariff-duplicate', 'tariff-2'],
  });
  const guarded = service.applyFinalKnowledgeGuards(
    decision,
    'Tarifs b2c',
    ragResult(deduplicated),
  );

  assert.match(guarded.reply, /type de chambre/);
  assert.match(guarded.reply, /date du sejour/);
  assert.doesNotMatch(guarded.reply, /TOSKANA WORLD/);
  assert.deepEqual(guarded.sources, []);
}

function verifyIrrelevantRagRequiresHumanCheck() {
  const service = Object.create(AiService.prototype) as any;
  const decision = workflowDecision({
    normalizedMessage: 'Quel est le tarif du spa ?',
    intent: 'PRICE_QUERY',
  });
  const rag = ragResult([
    {
      id: 'hotel-description',
      content: 'Le resort dispose de chambres et se trouve a Hammamet.',
      score: 0.7,
      metadata: {
        articleId: 'description',
        articleTitle: 'Presentation TOSKANA WORLD',
      },
    },
  ]);

  const guarded = service.applyFinalKnowledgeGuards(
    decision,
    'Quel est le tarif du spa ?',
    rag,
  );

  assert.equal(guarded.canAnswer, false);
  assert.equal(guarded.handoffRequired, true);
  assert.equal(guarded.reason, 'rag_results_not_relevant');
  assert.deepEqual(guarded.sources, []);
}

// Test 2: "ممكن تحسب التكلفة" (price query without details) → hotel continuation recognized
function verifyHotelQueryIsRecognizedAsBusinessQuery() {
  const service = Object.create(AiService.prototype) as any;

  const queries = [
    'ممكن تحسب التكلفة',
    'je veux savoir le prix d une chambre',
    'nhajez hotel',
    '9addech el chambre',
  ];
  for (const msg of queries) {
    const needsKb = service.requiresCompanyKnowledge(msg, 'HOTEL_PRICE_QUERY');
    assert.equal(
      needsKb,
      true,
      `requiresCompanyKnowledge should be true for hotel query: "${msg}"`,
    );
  }
}

// Test 3: Client provides dates + adults + children + ages → recognized as order continuation
function verifyHotelDetailProvisionIsOrderContinuation() {
  const service = Object.create(AiService.prototype) as any;

  const detailMessages = [
    'arrivée 10 juillet départ 17 juillet 2 adultes 1 enfant 5 ans',
    '10/07 au 17/07 2 adultes',
    'entrée 10 juillet sortie 17 juillet',
    '2 adultes et 1 enfant de 5 ans',
    'الدخول 10 جويلية والخروج 17 جويلية',
  ];
  for (const msg of detailMessages) {
    const isContinuation = service.isOrderContinuation(msg);
    assert.equal(
      isContinuation,
      true,
      `isOrderContinuation should be true for hotel detail provision: "${msg}"`,
    );
  }
}

// Test 4: Sources deduplication in final response
function verifySourcesAreDeduplicatedInResponse() {
  const service = Object.create(AiService.prototype) as any;

  // stringArray is used for sources — verify it deduplicates
  const rawSources = ['chunk-1', 'chunk-2', 'chunk-1', 'chunk-3', 'chunk-2'];
  const deduped = service.stringArray(rawSources);
  assert.deepEqual(
    deduped,
    ['chunk-1', 'chunk-2', 'chunk-3'],
    'Sources must be deduplicated',
  );
}

// Test 5: formatEvidenceBullet must NOT prefix article title
function verifyFallbackBulletContainsNoArticleTitle() {
  const service = Object.create(AiService.prototype) as any;

  const evidence = {
    id: 'chunk-toskana',
    content: 'Chambre Standard 115 TND par personne en juin.',
    score: 0.9,
    metadata: {
      articleTitle: 'Tarifs B2C 2026 - Tarification des chambres',
      companyId: TOSKANA_COMPANY_ID,
    },
  };

  const bullet = service.formatEvidenceBullet(evidence);

  assert.ok(bullet.length > 0, 'Bullet must be non-empty when content exists');
  assert.ok(
    !bullet.includes('Tarifs B2C 2026'),
    'Bullet must NOT contain article title',
  );
  assert.ok(
    bullet.includes('115 TND') || bullet.includes('Chambre Standard'),
    'Bullet must contain actual content from the chunk',
  );
}

// Test 6: Company isolation — each company uses only its own KB chunks
async function verifyStrictCompanyKbIsolation() {
  const COMPANY_A = 'company-a';
  const COMPANY_B = 'company-b';

  const allChunks = [
    retrieverChunk(COMPANY_A, 'chunk-a'),
    retrieverChunk(COMPANY_B, 'chunk-b'),
  ];
  const retriever = new PgvectorRetriever(
    {
      $queryRaw: async () => [],
      kbChunk: {
        findMany: async ({ where }: { where: Record<string, any> }) => {
          const serialized = JSON.stringify(where);
          const companyId = serialized.includes(COMPANY_A) ? COMPANY_A : COMPANY_B;
          return allChunks.filter((c) => c.companyId === companyId);
        },
      },
    } as never,
    { generateEmbedding: async () => Array.from({ length: 1536 }, () => 0) } as never,
  );

  const resultsA = await retriever.retrieve('prix chambre hotel', 8, { companyId: COMPANY_A });
  const resultsB = await retriever.retrieve('prix chambre hotel', 8, { companyId: COMPANY_B });

  assert.ok(
    resultsA.every((r: { metadata?: Record<string, unknown> }) => r.metadata?.companyId === COMPANY_A),
    'Company A must only receive Company A chunks',
  );
  assert.ok(
    resultsB.every((r: { metadata?: Record<string, unknown> }) => r.metadata?.companyId === COMPANY_B),
    'Company B must only receive Company B chunks',
  );
  assert.ok(
    !resultsA.some((r: { metadata?: Record<string, unknown> }) => r.metadata?.chunkId === 'chunk-b'),
    'Company A must not see Company B chunks',
  );
}

// Test 7: finalizeOrderDetails for reservation computes missingFields
function verifyReservationMissingFieldsDetected() {
  const service = Object.create(AiService.prototype) as any;

  const partialReservation = service.parseOrderDetails({
    actionType: 'reservation',
    checkInDate: null,
    checkOutDate: null,
    numberOfAdults: null,
    numberOfChildren: null,
    childrenAges: null,
    roomType: null,
  });
  const finalized = service.finalizeOrderDetails(partialReservation);

  assert.ok(
    finalized.missingFields.includes('checkInDate'),
    'checkInDate must be in missingFields',
  );
  assert.ok(
    finalized.missingFields.includes('checkOutDate'),
    'checkOutDate must be in missingFields',
  );
  assert.ok(
    finalized.missingFields.includes('numberOfAdults'),
    'numberOfAdults must be in missingFields',
  );
  assert.equal(
    finalized.confirmationStatus,
    'collecting_details',
    'confirmationStatus should be collecting_details when fields are missing',
  );
}

function officialRetrieverChunks() {
  const chunker = new ChunkerService();

  return TOSKANAWORLD_2026_ARTICLES.flatMap(
    (article: Record<string, any>, articleIndex: number) =>
      chunker
        .chunkText(
          article.content,
          1200,
          120,
          `TOSKANA WORLD. ${article.title}. Section: ${article.category}. Mots-cles: ${article.tags.join(', ')}`,
        )
        .map((chunk: Record<string, any>) => ({
          id: `official-${articleIndex}-${chunk.index}`,
          companyId: TOSKANA_COMPANY_ID,
          articleId: `official-article-${articleIndex}`,
          chunkIndex: chunk.index,
          chunkText: chunk.content,
          metadataJson: null,
          article: {
            companyId: TOSKANA_COMPANY_ID,
            title: article.title,
            category: article.category,
            tags: article.tags,
            language: 'fr',
            status: 'published',
            sourceUrl: null,
          },
        })),
  );
}

async function retrieveOfficial(query: string) {
  const chunks = officialRetrieverChunks();
  const retriever = new PgvectorRetriever(
    {
      $queryRaw: async () => [],
      kbChunk: {
        findMany: async () => chunks,
      },
    } as never,
    { generateEmbedding: async () => [] } as never,
  );

  return retriever.retrieve(query, 12, { companyId: TOSKANA_COMPANY_ID });
}

async function verifyOfficialTariffQuestions() {
  assert.equal(TOSKANAWORLD_2026_ARTICLES.length, 12);
  const service = Object.create(AiService.prototype) as any;

  const cases = [
    {
      query: 'Prix chambre standard en juin ?',
      expected: ['115 TND'],
      excluded: ['160 TND', '200 TND'],
    },
    {
      query: 'Prix chambre standard en juillet ?',
      expected: ['160 TND', '200 TND'],
      excluded: ['115 TND'],
    },
    {
      query: 'Prix Junior Suite en aout ?',
      expected: ['1200 TND'],
      excluded: ['700 TND', '950 TND'],
    },
  ];

  for (const item of cases) {
    const results = await retrieveOfficial(item.query);
    const evidences = results.map((result: Record<string, any>) => ({
      id: result.metadata.chunkId,
      content: result.content,
      score: result.score,
      metadata: result.metadata,
    }));
    const guarded = service.applyFinalKnowledgeGuards(
      workflowDecision({
        normalizedMessage: item.query,
        intent: 'PRICE_QUERY',
      }),
      item.query,
      ragResult(evidences),
    );

    for (const expected of item.expected) assert.match(guarded.reply, new RegExp(expected));
    for (const excluded of item.excluded) assert.doesNotMatch(guarded.reply, new RegExp(excluded));
    assert.ok(guarded.sources.length > 0);
  }

  const topicCases = [
    { query: 'Supplement vue mer ?', expected: ['17 TND', '33 TND', '48 TND'] },
    { query: 'Reduction enfant ?', expected: ['50 %', '30 %'] },
    { query: 'Minimum stay ?', expected: ['3 nuits', '4 nuits', '5 nuits'] },
  ];

  for (const item of topicCases) {
    const results = await retrieveOfficial(item.query);
    const evidences = results.map((result: Record<string, any>) => ({
      id: result.metadata.chunkId,
      content: result.content,
      score: result.score,
      metadata: result.metadata,
    }));
    const guarded = service.applyFinalKnowledgeGuards(
      workflowDecision({
        normalizedMessage: item.query,
        intent: 'BUSINESS_QUERY',
        reply: '',
      }),
      item.query,
      ragResult(evidences),
    );

    for (const expected of item.expected) assert.match(guarded.reply, new RegExp(expected));
    assert.ok(guarded.sources.length > 0);
  }

  const quoteQuery = 'Prix pour 2 adultes et 1 enfant ?';
  const quoteResults = await retrieveOfficial(quoteQuery);
  const quoteDecision = workflowDecision({
    normalizedMessage: quoteQuery,
    intent: 'PRICE_QUERY',
    orderIntent: true,
    orderDetails: {
      ...workflowDecision().orderDetails,
      actionType: 'reservation',
      numberOfAdults: 2,
      numberOfChildren: 1,
    },
  });
  const guardedQuote = service.applyFinalKnowledgeGuards(
    quoteDecision,
    quoteQuery,
    ragResult(
      quoteResults.map((result: Record<string, any>) => ({
        id: result.metadata.chunkId,
        content: result.content,
        score: result.score,
        metadata: result.metadata,
      })),
    ),
  );

  assert.match(guardedQuote.reply, /date d'arrivee/);
  assert.match(guardedQuote.reply, /date de depart/);
  assert.match(guardedQuote.reply, /age de chaque enfant/);
  assert.match(guardedQuote.reply, /type de chambre/);
  assert.deepEqual(guardedQuote.sources, []);
}

async function run() {
  await verifyArticleLifecycle();
  await verifyStructuredImports();
  await verifyMultilingualRetrievalAndIsolation();
  verifyAgentAsksForStayDetails();
  verifyGreetingSkipsRag();
  verifyRagResultsAreDeduplicatedAndLimited();
  verifyRoomTypesUseChunkContent();
  verifyAvailabilityDatesNeedRealCalendar();
  verifyB2cTariffsUseExactDeduplicatedFacts();
  verifyIrrelevantRagRequiresHumanCheck();
  verifyHotelQueryIsRecognizedAsBusinessQuery();
  verifyHotelDetailProvisionIsOrderContinuation();
  verifySourcesAreDeduplicatedInResponse();
  verifyFallbackBulletContainsNoArticleTitle();
  await verifyStrictCompanyKbIsolation();
  verifyReservationMissingFieldsDetected();
  await verifyOfficialTariffQuestions();
  console.log('Toskana World KB lifecycle, multilingual RAG and agent tests passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
