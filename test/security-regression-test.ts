import 'reflect-metadata';
import assert from 'node:assert/strict';

const { UserRole } = require('../dist/src/common/enums/user-role.enum.js');
const { ROLES_KEY } = require('../dist/src/common/decorators/roles.decorator.js');
const { WorkflowAiService } = require(
  '../dist/src/modules/ai/workflow-ai.service.js',
);
const { CompanyAiPolicyService } = require(
  '../dist/src/modules/ai/company-ai-policy.service.js',
);
const { ConversationWindowService } = require(
  '../dist/src/modules/whatsapp/policies/conversation-window.service.js',
);
const { UrlParser } = require(
  '../dist/src/modules/knowledge-base/ingestion/parsers/url.parser.js',
);
const { FileSecurityService } = require(
  '../dist/src/modules/knowledge-base/ingestion/file-security.service.js',
);
const { EmbeddingsService } = require(
  '../dist/src/modules/knowledge-base/ingestion/embeddings.service.js',
);
const { PgvectorRetriever } = require(
  '../dist/src/modules/rag/retrievers/pgvector.retriever.js',
);
const { PdfImportRepository } = require(
  '../dist/src/modules/knowledge-base/pdf-import.repository.js',
);
const { PdfImportService } = require(
  '../dist/src/modules/knowledge-base/pdf-import.service.js',
);
const { WhatsappService } = require(
  '../dist/src/modules/whatsapp/whatsapp.service.js',
);
const { WhatsappComplianceService } = require(
  '../dist/src/modules/whatsapp/policies/whatsapp-compliance.service.js',
);
const { KbArticlesController } = require(
  '../dist/src/modules/knowledge-base/kb-articles.controller.js',
);
const { PdfImportController } = require(
  '../dist/src/modules/knowledge-base/pdf-import.controller.js',
);
const {
  DraftArticleStatus,
  PdfImportStatus,
} = require('../dist/src/generated/prisma/client.js');

async function testHandoffBlocksAiEndToEnd() {
  let providerCalls = 0;
  const conversation = {
    id: 'conversation-a',
    companyId: 'company-a',
    contactId: 'contact-a',
    assignedTo: 'agent-a',
    status: 'human_assigned',
    botPaused: true,
    handoffRequired: true,
    lastCustomerMessageAt: new Date(),
    lastAiDecision: null,
    conversationSummary: null,
    messages: [],
  };
  const service = new WorkflowAiService(
    {
      conversation: { findUnique: async () => conversation },
      companyWhatsappInstance: {
        findFirst: async () => null,
        findMany: async () => [],
      },
    },
    {
      generateAnswer: async () => {
        providerCalls += 1;
        throw new Error('LLM must not be called during handoff');
      },
      getConfiguredProvider: () => 'fake',
    },
    { query: async () => assert.fail('RAG must not be called during handoff') },
    { create: async () => assert.fail('No AiRun is expected without messageId') },
  );

  const result = await service.generateReply(
    {
      message: 'Quel est le prix ?',
      conversationId: conversation.id,
      companyId: conversation.companyId,
      contactId: conversation.contactId,
      direction: 'inbound',
      messageType: 'text',
      hasMedia: false,
      rawPayload: {},
    },
    { id: 'agent-a', role: UserRole.AGENT, companyId: 'company-a' },
  );

  assert.equal(providerCalls, 0);
  assert.equal(result.shouldSendMessage, false);
  assert.equal(result.handoffRequired, true);
  assert.equal(result.reason, 'human_handoff_active');
}

function testWhatsappWindowBoundary() {
  const service = new ConversationWindowService();
  const now = new Date('2026-06-14T12:00:00.000Z');

  assert.equal(
    service.checkWindow(new Date('2026-06-13T12:00:00.001Z'), now)
      .canSendFreeForm,
    true,
  );
  assert.equal(
    service.checkWindow(new Date('2026-06-13T12:00:00.000Z'), now)
      .canSendFreeForm,
    false,
  );
  assert.equal(service.checkWindow(null, now).reason, 'NO_CUSTOMER_MESSAGE');
}

async function testClosedWindowBlocksProviderSend() {
  let providerCalls = 0;
  const service = new WhatsappService(
    {
      conversation: {
        findFirst: async () => ({
          id: 'conversation-window',
          companyId: 'company-a',
          assignedTo: null,
          status: 'bot_active',
          botPaused: false,
          handoffRequired: false,
          lastCustomerMessageAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
          contact: { phone: '+21620000000' },
        }),
      },
      companyWhatsappInstance: {
        findFirst: async () => ({
          companyId: 'company-a',
          evolutionInstanceName: 'instance-a',
          apiBaseUrl: 'https://evolution.example.test',
          apiKey: 'secret',
        }),
      },
    },
    {},
    {
      sendTextMessage: async () => {
        providerCalls += 1;
        return { success: true, messageId: 'unexpected' };
      },
    },
    new ConversationWindowService(),
    new WhatsappComplianceService(),
  );

  const result = await service.sendWorkflowMessage({
    conversationId: 'conversation-window',
    message: 'Reponse automatique',
    senderType: 'bot',
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.sent, false);
  assert.equal(result.canSendFreeForm, false);
  assert.equal(result.reason, 'WINDOW_EXPIRED');
}

async function testUrlAndFileSecurity() {
  const urlParser = new UrlParser();
  await assert.rejects(() => urlParser.parse('file:///etc/passwd'));
  await assert.rejects(() => urlParser.parse('http://127.0.0.1/private'));
  await assert.rejects(() => urlParser.parse('http://169.254.169.254/latest/meta-data'));

  const files = new FileSecurityService();
  await assert.rejects(() =>
    files.validate({
      buffer: Buffer.from('not a pdf'),
      originalname: 'document.pdf',
      mimetype: 'application/pdf',
      size: 9,
    }),
  );
  await files.validate({
    buffer: Buffer.from('%PDF-1.7\n%%EOF'),
    originalname: 'document.pdf',
    mimetype: 'application/pdf',
    size: 14,
  });
  await assert.rejects(() =>
    files.validate({
      buffer: Buffer.from('%PDF-1.7'),
      originalname: '../document.pdf',
      mimetype: 'application/pdf',
      size: 8,
    }),
  );
}

async function testEmbeddingContract() {
  const config = {
    get: (key: string) =>
      ({ EMBEDDING_PROVIDER: 'openai-compatible', EMBEDDING_BATCH_SIZE: 2 })[
        key
      ],
  };
  const provider = {
    name: 'test-provider',
    generate: async (texts: string[], dimensions: number) =>
      texts.map(() => Array.from({ length: dimensions }, () => 0.01)),
  };
  const service = new EmbeddingsService(config, provider, provider);
  const vectors = await service.generateEmbeddings(['article un', 'article deux']);
  assert.equal(vectors.length, 2);
  assert.ok(vectors.every((vector: number[]) => vector.length === 1536));

  const invalidProvider = {
    name: 'invalid-provider',
    generate: async (texts: string[]) => texts.map(() => [1, 2, 3]),
  };
  const invalid = new EmbeddingsService(config, invalidProvider, invalidProvider);
  await assert.rejects(() => invalid.generateEmbedding('question'));
}

function testRagTenantFilter() {
  const retriever = new PgvectorRetriever({}, { generateEmbedding: async () => [] });
  const where = retriever.buildWhere({ companyId: 'company-a', language: 'fr' });
  const serialized = JSON.stringify(where);

  assert.match(serialized, /company-a/);
  assert.match(serialized, /published/);
  assert.match(serialized, /companyId/);
}

async function testPdfStatusAndClaimContract() {
  let updatedStatus: string | null = null;
  const repository = new PdfImportRepository({
    pdfDraftArticle: {
      updateMany: async (args: Record<string, any>) => {
        assert.equal(args.where.status, DraftArticleStatus.PENDING);
        assert.equal(args.where.kbArticleId, null);
        assert.equal(args.where.import.companyId, 'company-a');
        return { count: 1 };
      },
    },
  });

  const claim = await repository.claimPendingArticle({
    articleId: 'draft-a',
    importId: 'import-a',
    companyId: 'company-a',
    reviewedBy: 'admin-a',
    claimedAt: new Date(),
  });
  assert.equal(claim.count, 1);

  const client = {
    pdfDraftArticle: {
      findMany: async () => [
        { status: DraftArticleStatus.APPROVED },
        { status: DraftArticleStatus.PENDING },
      ],
    },
    pdfImportDraft: {
      update: async (args: Record<string, any>) => {
        updatedStatus = args.data.status;
        return args.data;
      },
    },
  };
  await repository.recalculateImportStatusWithClient(client, 'import-a');
  assert.equal(updatedStatus, PdfImportStatus.PARTIALLY_DONE);

  client.pdfDraftArticle.findMany = async () => [
    { status: DraftArticleStatus.APPROVED },
    { status: DraftArticleStatus.REJECTED },
  ];
  await repository.recalculateImportStatusWithClient(client, 'import-a');
  assert.equal(updatedStatus, PdfImportStatus.COMPLETED);
}

async function testPdfApprovalCompensation() {
  let rollbackCalls = 0;
  let releaseCalls = 0;
  const repository = {
    findArticle: async () => ({
      id: 'draft-a',
      importId: 'import-a',
      title: 'Article',
      category: 'General',
      body: 'Contenu suffisamment long',
      tags: [],
      status: DraftArticleStatus.PENDING,
    }),
    claimPendingArticle: async () => ({ count: 1 }),
    completeClaimedArticle: async () => null,
    releaseClaim: async () => {
      releaseCalls += 1;
      return { count: 1 };
    },
  };
  const service = new PdfImportService(repository, {}, {}, {
    createFromPdfDraft: async () => ({ id: 'pdf-draft:draft-a' }),
    rollbackPdfDraftPublication: async () => {
      rollbackCalls += 1;
    },
  });

  await assert.rejects(() =>
    service.reviewArticle(
      'import-a',
      'draft-a',
      { action: 'approve' },
      { sub: 'admin-a', role: UserRole.COMPANY_ADMIN, companyId: 'company-a' },
    ),
  );
  assert.equal(rollbackCalls, 1);
  assert.equal(releaseCalls, 1);
}

function testKbWritePermissions() {
  const expected = [UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN];
  for (const method of ['create', 'ingest', 'ingestFile', 'rebuild', 'update', 'publish', 'remove']) {
    const roles = Reflect.getMetadata(ROLES_KEY, KbArticlesController.prototype[method]);
    assert.deepEqual(roles, expected, `${method} must be admin-only`);
  }

  const pdfRoles = Reflect.getMetadata(ROLES_KEY, PdfImportController);
  assert.deepEqual(pdfRoles, [UserRole.COMPANY_ADMIN]);
}

async function testCompanyBusinessPolicy() {
  const configuredGeneric = new CompanyAiPolicyService({
    setting: {
      findFirst: async () => ({ value: { aiPolicy: { businessDomain: 'generic' } } }),
    },
    companyRegistrationRequest: { findFirst: async () => ({ businessType: 'hotel' }) },
  });
  assert.equal(
    await configuredGeneric.resolveBusinessDomain('company-a', ['hotel resort']),
    'generic',
  );

  const registeredHotel = new CompanyAiPolicyService({
    setting: { findFirst: async () => null },
    companyRegistrationRequest: { findFirst: async () => ({ businessType: 'Hotellerie' }) },
  });
  assert.equal(
    await registeredHotel.resolveBusinessDomain('company-b'),
    'hospitality',
  );
}

async function testNoKbSourceTriggersHandoff() {
  // Uses a specific policy/procedure question (not a generic price query) so the
  // guard cannot answer with a tariff clarification — it must fall through to handoff.
  const conversation = {
    id: 'conv-no-kb',
    companyId: 'company-b',
    contactId: 'contact-b',
    assignedTo: null,
    status: 'bot_active',
    botPaused: false,
    handoffRequired: false,
    lastCustomerMessageAt: new Date(),
    lastAiDecision: null,
    conversationSummary: null,
    messages: [],
  };

  const service = new WorkflowAiService(
    {
      conversation: { findUnique: async () => conversation },
      company: { findUnique: async () => ({ name: 'TestCo' }) },
      message: { findFirst: async () => ({ id: 'msg-1' }) },
      companyWhatsappInstance: {
        findFirst: async () => ({
          companyId: 'company-b',
          evolutionInstanceName: 'instance-b',
        }),
        findMany: async () => [],
      },
      aiRun: { create: async () => ({}) },
    },
    {
      generateAnswer: async () => ({
        text: JSON.stringify({
          normalizedMessage: 'quelles sont les conditions dannulation',
          detectedLanguage: 'fr',
          intent: 'CANCELLATION_POLICY',
          needsRag: true,
          canAnswer: false,
          handoffRequired: false,
          orderIntent: false,
          orderDetails: {
            actionType: null, customerName: null, requestedItem: null,
            quantity: null, requestedDate: null, address: null, phone: null,
            notes: null, items: [], total: null, currency: null,
            availability: null, confirmationStatus: null, missingFields: [],
            checkInDate: null, checkOutDate: null, nights: null,
            numberOfAdults: null, numberOfChildren: null, childrenAges: null,
            roomType: null, boardFormula: null, numberOfRooms: null, selectedChoice: null,
          },
          replyDraft: '',
          reply: '',
          keywordsForSearch: ['annulation', 'conditions'],
          sources: [],
          confidence: 0.1,
          reason: null,
        }),
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        provider: 'test',
        model: 'test-model',
        fallbackUsed: false,
        attempts: [],
      }),
      getConfiguredProvider: () => 'test',
    },
    {
      query: async () => ({
        answer: '',
        context: '',
        sources: [],
        confidence: 0,
        hasReliableSources: false,
        evidences: [],
        sourceChunkIds: [],
        sourceArticleIds: [],
        retrievedChunksPreview: [],
      }),
    },
    { create: async () => ({}) },
  );

  const result = await service.generateReply(
    {
      message: 'Quelles sont les conditions d\'annulation ?',
      conversationId: conversation.id,
      companyId: conversation.companyId,
      contactId: conversation.contactId,
      instanceName: 'instance-b',
      messageId: 'msg-1',
      phoneNumber: '+21600000001',
      messageType: 'text',
      hasMedia: false,
      direction: 'inbound',
      rawPayload: {},
    },
    { id: 'agent-b', role: UserRole.AGENT, companyId: 'company-b' },
    { enforceWorkflowPayload: false },
  );

  assert.equal(result.handoffRequired, true, 'handoffRequired must be true when KB has no source for a specific query');
  assert.equal(result.canAnswer, false, 'canAnswer must be false when KB has no source');
  assert.match(result.reason ?? '', /missing_company_evidence|rag_results_not_relevant/);
}

async function testMediaAudioWithoutTextRequiresClarification() {
  const conversation = {
    id: 'conv-audio',
    companyId: 'company-c',
    contactId: 'contact-c',
    assignedTo: null,
    status: 'bot_active',
    botPaused: false,
    handoffRequired: false,
    lastCustomerMessageAt: new Date(),
    lastAiDecision: null,
    conversationSummary: null,
    messages: [],
  };

  let providerCalls = 0;
  const service = new WorkflowAiService(
    {
      conversation: { findUnique: async () => conversation },
      company: { findUnique: async () => ({ name: 'TestCo' }) },
      message: { findFirst: async () => ({ id: 'msg-audio' }) },
      companyWhatsappInstance: {
        findFirst: async () => ({
          companyId: 'company-c',
          evolutionInstanceName: 'instance-c',
        }),
        findMany: async () => [],
      },
      aiRun: { create: async () => ({}) },
    },
    {
      generateAnswer: async () => {
        providerCalls += 1;
        throw new Error('LLM must not be called for audio-only message');
      },
      getConfiguredProvider: () => 'test',
    },
    { query: async () => assert.fail('RAG must not be called for audio-only message') },
    { create: async () => ({}) },
  );

  const result = await service.generateReply(
    {
      message: '',
      conversationId: conversation.id,
      companyId: conversation.companyId,
      contactId: conversation.contactId,
      instanceName: 'instance-c',
      messageId: 'msg-audio',
      phoneNumber: '+21600000002',
      messageType: 'audio',
      hasMedia: true,
      mediaType: 'audio',
      direction: 'inbound',
      rawPayload: {},
    },
    { id: 'agent-c', role: UserRole.AGENT, companyId: 'company-c' },
    { enforceWorkflowPayload: false },
  );

  assert.equal(providerCalls, 0, 'LLM must not be called for audio without text');
  assert.equal(result.shouldSendMessage, true, 'clarification message must be sent');
  assert.equal(result.reason, 'media_requires_clarification');
  assert.match(result.reply ?? '', /transcrire|audio|écrire|demande/i);
}

function testContextPrefixNoToskanaHardcode() {
  const { KbArticlesService } = require(
    '../dist/src/modules/knowledge-base/kb-articles.service.js',
  );
  const instance = new KbArticlesService(null, null, null, null);
  const build = instance.buildArticleContextPrefix.bind(instance);

  const prefix: string = build(
    {
      company: { name: 'ToskanaWorld', legalName: null },
      title: 'Tarifs chambres',
      category: 'Hebergement',
    },
    ['hotel', 'toskana'],
  );

  assert.ok(!prefix.includes('ToskanaWorld Beach Resort Hammamet'),
    'buildArticleContextPrefix must not inject hardcoded Toskana string');
  assert.ok(prefix.includes('ToskanaWorld'),
    'company name from DB must still appear in context prefix');
}

async function testFrustrationDetectionTriggersHandoff() {
  // Validates that explicit frustration / complaint keywords trigger immediate handoff
  // without calling the LLM or RAG at all.
  const conversation = {
    id: 'conv-frustration',
    companyId: 'company-f',
    contactId: 'contact-f',
    assignedTo: null,
    status: 'bot_active',
    botPaused: false,
    handoffRequired: false,
    lastCustomerMessageAt: new Date(),
    lastAiDecision: null,
    conversationSummary: null,
    messages: [
      { direction: 'inbound', content: 'J ai commandé il y a 2h' },
      { direction: 'outbound', content: 'Votre commande est en cours.' },
    ],
  };

  let providerCalls = 0;
  let ragCalls = 0;
  const service = new WorkflowAiService(
    {
      conversation: { findUnique: async () => conversation },
      company: { findUnique: async () => ({ name: 'FlavoNation' }) },
      message: { findFirst: async () => ({ id: 'msg-frust' }) },
      companyWhatsappInstance: {
        findFirst: async () => ({
          companyId: 'company-f',
          evolutionInstanceName: 'instance-f',
        }),
        findMany: async () => [],
      },
      aiRun: { create: async () => ({}) },
    },
    {
      generateAnswer: async () => {
        providerCalls += 1;
        throw new Error('LLM must not be called when frustration is detected');
      },
      getConfiguredProvider: () => 'test',
    },
    {
      query: async () => {
        ragCalls += 1;
        throw new Error('RAG must not be called when frustration is detected');
      },
    },
    { create: async () => ({}) },
  );

  const frustratingMessages = [
    'Je veux parler à un responsable maintenant',
    'C est scandaleux je vais porter plainte',
    'Je suis pas content du tout avec votre service',
    'Donnez-moi votre directeur',
    'Je veux un remboursement immédiatement',
  ];

  for (const msg of frustratingMessages) {
    const result = await service.generateReply(
      {
        message: msg,
        conversationId: conversation.id,
        companyId: conversation.companyId,
        contactId: conversation.contactId,
        instanceName: 'instance-f',
        messageId: 'msg-frust',
        phoneNumber: '+21600000005',
        messageType: 'text',
        hasMedia: false,
        direction: 'inbound',
        rawPayload: {},
      },
      { id: 'agent-f', role: UserRole.AGENT, companyId: 'company-f' },
      { enforceWorkflowPayload: false },
    );

    assert.equal(result.handoffRequired, true,
      `handoffRequired must be true for frustration message: "${msg}"`);
    assert.equal(result.shouldSendMessage, true,
      `shouldSendMessage must be true — polite handoff reply must be sent for: "${msg}"`);
    assert.ok(
      result.reason === 'customer_frustration_detected' ||
      result.reason === 'explicit_human_agent_request',
      `reason must indicate frustration/human-request, got: ${result.reason}`,
    );
    // LLM and RAG must not have been called
    assert.equal(providerCalls, 0, `LLM must not be called for frustration message: "${msg}"`);
    assert.equal(ragCalls, 0, `RAG must not be called for frustration message: "${msg}"`);
  }
}

async function testAllProvidersFailedTriggersHumanHandoff() {
  // Validates that when ALL AI providers fail, the system:
  // 1. Does NOT send a raw KB reply
  // 2. Sets handoffRequired = true
  // 3. Sends a polite transfer message to the customer
  const conversation = {
    id: 'conv-allfail',
    companyId: 'company-g',
    contactId: 'contact-g',
    assignedTo: null,
    status: 'bot_active',
    botPaused: false,
    handoffRequired: false,
    lastCustomerMessageAt: new Date(),
    lastAiDecision: null,
    conversationSummary: null,
    messages: [],
  };

  const service = new WorkflowAiService(
    {
      conversation: { findUnique: async () => conversation },
      company: { findUnique: async () => ({ name: 'ToskanaWorld' }) },
      message: { findFirst: async () => ({ id: 'msg-fail' }) },
      companyWhatsappInstance: {
        findFirst: async () => ({
          companyId: 'company-g',
          evolutionInstanceName: 'instance-g',
        }),
        findMany: async () => [],
      },
      aiRun: { create: async () => ({}) },
    },
    {
      // All providers fail
      generateAnswer: async () => {
        throw new Error('All AI providers unavailable');
      },
      getConfiguredProvider: () => 'openrouter',
    },
    {
      query: async () => ({
        evidences: [],
        sourceArticleIds: [],
        sourceChunkIds: [],
        hasReliableSources: false,
        confidence: 0,
      }),
    },
    { create: async () => ({}) },
  );

  const result = await service.generateReply(
    {
      message: 'Quels sont les tarifs de la chambre standard ?',
      conversationId: conversation.id,
      companyId: conversation.companyId,
      contactId: conversation.contactId,
      instanceName: 'instance-g',
      messageId: 'msg-fail',
      phoneNumber: '+21600000006',
      messageType: 'text',
      hasMedia: false,
      direction: 'inbound',
      rawPayload: {},
    },
    { id: 'agent-g', role: UserRole.AGENT, companyId: 'company-g' },
    { enforceWorkflowPayload: false },
  );

  assert.equal(result.handoffRequired, true,
    'handoffRequired must be true when all AI providers fail');
  assert.equal(result.shouldSendMessage, true,
    'A polite handoff message must be sent when all providers fail');
  assert.ok(
    result.reply?.length > 0,
    'A non-empty reply must be sent when all providers fail',
  );
  // The reply must NOT be raw KB content — it must be a handoff message
  assert.ok(
    !/tarif|chambre|prix|TND/i.test(result.reply ?? ''),
    'Reply must not contain raw KB content when AI providers fail',
  );
  assert.equal(result.usedKb, false,
    'usedKb must be false when AI providers fail — KB must not be used as standalone response');
}

function testToskanaSupplementaryArticlesExist() {
  // Validates that the supplementary non-tariff articles were added to the Toskana KB data.
  const { TOSKANAWORLD_2026_ARTICLES } = require(
    '../dist/src/modules/knowledge-base/data/toskanaworld-2026-kb.data.js',
  );

  const titles: string[] = (TOSKANAWORLD_2026_ARTICLES as { title: string }[]).map(
    (article) => article.title,
  );

  const required = [
    'ToskanaWorld - Localisation et acces',
    'ToskanaWorld - Services et equipements de l hotel',
    'ToskanaWorld - Spa et bien-etre',
    'ToskanaWorld - Comment reserver',
    'ToskanaWorld - Contact et informations pratiques',
  ];

  for (const title of required) {
    assert.ok(
      titles.includes(title),
      `Article "${title}" must exist in TOSKANAWORLD_2026_ARTICLES`,
    );
  }

  // Must have more than the original 12 tariff articles
  assert.ok(
    TOSKANAWORLD_2026_ARTICLES.length > 12,
    `Expected more than 12 articles after supplementary additions, got ${TOSKANAWORLD_2026_ARTICLES.length}`,
  );
}

async function main() {
  await testHandoffBlocksAiEndToEnd();
  testWhatsappWindowBoundary();
  await testClosedWindowBlocksProviderSend();
  await testUrlAndFileSecurity();
  await testEmbeddingContract();
  testRagTenantFilter();
  await testPdfStatusAndClaimContract();
  await testPdfApprovalCompensation();
  testKbWritePermissions();
  await testCompanyBusinessPolicy();
  await testNoKbSourceTriggersHandoff();
  await testMediaAudioWithoutTextRequiresClarification();
  testContextPrefixNoToskanaHardcode();
  await testFrustrationDetectionTriggersHandoff();
  await testAllProvidersFailedTriggersHumanHandoff();
  testToskanaSupplementaryArticlesExist();
  console.log('Security and state regression tests passed.');
}

void main();
