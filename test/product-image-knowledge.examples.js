const { strict: assert } = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const {
  ProductVisionService,
} = require('../dist/src/modules/products/product-vision.service.js');

function product(overrides = {}) {
  return {
    id: overrides.id ?? 'product-a',
    companyId: overrides.companyId ?? 'company-a',
    name: overrides.name ?? 'Sac a main en cuir marron',
    description: overrides.description ?? 'Sac moyen avec fermeture doree.',
    category: overrides.category ?? 'accessoires',
    price: overrides.price === undefined ? 85 : overrides.price,
    currency: overrides.currency ?? 'TND',
    isAvailable: overrides.isAvailable ?? true,
    status: overrides.status ?? 'ACTIVE',
    keywords: overrides.keywords ?? ['sac', 'marron', 'cuir'],
    variants: null,
    metadata: null,
    images: [],
  };
}

function searchResult(row, score = 0.86) {
  return {
    product: row,
    score,
    confidence: score,
    matchedTokens: ['sac', 'marron', 'cuir'],
    searchableText: `${row.name} ${row.description ?? ''}`,
  };
}

function createVisionHarness() {
  let nextAnalysis = {
    detectedObject: 'sac a main',
    color: 'marron',
    material: 'cuir apparent',
    visibleBrand: null,
    visibleText: null,
    distinctiveFeatures: ['fermeture doree', 'taille moyenne'],
    keywords: ['sac', 'marron', 'cuir', 'accessoire'],
    confidence: 0.82,
  };
  let nextResults = [searchResult(product())];
  const calls = [];

  const gemini = {
    generateImageUnderstanding: async () => ({
      text: JSON.stringify(nextAnalysis),
      model: 'gemini-2.5-flash',
    }),
  };
  const productSearch = {
    searchProducts: async (params) => {
      calls.push(params);
      return nextResults;
    },
    tokenize: (value) =>
      String(value ?? '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
  };
  const config = {
    get: () => '0.62',
  };

  return {
    service: new ProductVisionService(gemini, productSearch, config),
    calls,
    setAnalysis: (analysis) => {
      nextAnalysis = analysis;
    },
    setResults: (results) => {
      nextResults = results;
    },
  };
}

async function testImageWithCaptionMatchesCompanyProduct() {
  const harness = createVisionHarness();
  const result = await harness.service.analyzeAndMatch({
    companyId: 'company-a',
    caption: 'Combien coute celui-ci ?',
    mediaUrl: 'https://example.test/sac.jpg',
    rawPayload: {},
  });

  assert.equal(harness.calls[0].companyId, 'company-a');
  assert.match(harness.calls[0].query, /combien coute/i);
  assert.equal(result.reliable, true);
  assert.equal(result.match.product.companyId, 'company-a');
  const reply = harness.service.buildReplyFromMatch(result);
  assert.match(reply.answer, /Sac a main en cuir marron/);
  assert.match(reply.answer, /85 DT/);
  assert.equal(reply.handoffRequired, false);
}

async function testImageWithoutCaptionUsesVisionOnly() {
  const harness = createVisionHarness();
  const result = await harness.service.analyzeAndMatch({
    companyId: 'company-a',
    caption: '',
    mediaUrl: 'https://example.test/sac.jpg',
    rawPayload: {},
  });

  assert.match(harness.calls[0].query, /sac a main/);
  assert.equal(result.reliable, true);
}

async function testNoProductTriggersHandoff() {
  const harness = createVisionHarness();
  harness.setResults([]);
  const result = await harness.service.analyzeAndMatch({
    companyId: 'company-a',
    caption: 'C est combien ?',
    mediaUrl: 'https://example.test/unknown.jpg',
    rawPayload: {},
  });
  const reply = harness.service.buildReplyFromMatch(result);

  assert.equal(result.match, null);
  assert.equal(result.reliable, false);
  assert.equal(reply.handoffRequired, true);
  assert.equal(reply.reason, 'product_image_uncertain');
}

async function testCompanyIsolationDoesNotUseOtherTenantProduct() {
  const harness = createVisionHarness();
  const companyBProduct = product({
    id: 'product-b',
    companyId: 'company-b',
    name: 'Sac concurrent',
  });
  harness.setResults([]);
  const result = await harness.service.analyzeAndMatch({
    companyId: 'company-a',
    caption: 'Ce sac',
    mediaUrl: 'https://example.test/sac-b.jpg',
    rawPayload: {},
  });

  assert.equal(harness.calls[0].companyId, 'company-a');
  assert.notEqual(result.match?.product.id, companyBProduct.id);
  assert.equal(result.reliable, false);
}

async function testAmbiguousImageRequiresHumanReview() {
  const harness = createVisionHarness();
  harness.setAnalysis({
    detectedObject: 'objet flou',
    color: null,
    material: null,
    visibleBrand: null,
    visibleText: null,
    distinctiveFeatures: [],
    keywords: ['flou'],
    confidence: 0.2,
  });
  harness.setResults([searchResult(product(), 0.9)]);
  const result = await harness.service.analyzeAndMatch({
    companyId: 'company-a',
    caption: '',
    mediaUrl: 'https://example.test/blurry.jpg',
    rawPayload: {},
  });

  assert.equal(result.reliable, false);
  assert.equal(harness.service.buildReplyFromMatch(result).handoffRequired, true);
}

function testClassicTextWorkflowStillNormalizes() {
  const workflowPath = path.resolve(
    __dirname,
    '../../n8n/WhatsApp AI Support Workflow.json',
  );
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
  const code = workflow.nodes.find((node) => node.name === 'Normalize Input')
    .parameters.jsCode;
  const run = (payload) => new Function('$json', code)(payload)[0].json;
  const normalized = run({
    body: {
      event: 'messages.upsert',
      instance: 'company-a-instance',
      data: {
        key: {
          remoteJid: '21611111111@s.whatsapp.net',
          fromMe: false,
          id: 'text-1',
        },
        pushName: 'Client',
        message: {
          conversation: 'Bonjour, je veux connaitre vos prix',
        },
      },
    },
  });

  assert.equal(normalized.messageType, 'text');
  assert.equal(normalized.messageText, 'Bonjour, je veux connaitre vos prix');
  assert.equal(normalized.caption, null);
  assert.equal(normalized.mediaUrl, null);
}

async function testUnavailableProductReply() {
  const harness = createVisionHarness();
  harness.setResults([
    searchResult(
      product({
        isAvailable: false,
      }),
    ),
  ]);
  const result = await harness.service.analyzeAndMatch({
    companyId: 'company-a',
    caption: 'Disponible ?',
    mediaUrl: 'https://example.test/sac.jpg',
    rawPayload: {},
  });
  const reply = harness.service.buildReplyFromMatch(result);

  assert.equal(reply.handoffRequired, true);
  assert.match(reply.answer, /indisponible/);
  assert.doesNotMatch(reply.answer, /alternative precise|promotion/i);
}

async function testMissingPriceDoesNotInventPrice() {
  const harness = createVisionHarness();
  harness.setResults([
    searchResult(
      product({
        price: null,
      }),
    ),
  ]);
  const result = await harness.service.analyzeAndMatch({
    companyId: 'company-a',
    caption: 'Combien ?',
    mediaUrl: 'https://example.test/sac.jpg',
    rawPayload: {},
  });
  const reply = harness.service.buildReplyFromMatch(result);

  assert.equal(reply.handoffRequired, true);
  assert.match(reply.answer, /prix n'est pas encore renseigne/);
  assert.doesNotMatch(reply.answer, /85|90|100/);
}

(async () => {
  await testImageWithCaptionMatchesCompanyProduct();
  await testImageWithoutCaptionUsesVisionOnly();
  await testNoProductTriggersHandoff();
  await testCompanyIsolationDoesNotUseOtherTenantProduct();
  await testAmbiguousImageRequiresHumanReview();
  testClassicTextWorkflowStillNormalizes();
  await testUnavailableProductReply();
  await testMissingPriceDoesNotInventPrice();
  console.log('Product image knowledge examples passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
