const { strict: assert } = require('node:assert');
const { AiService } = require('../dist/src/modules/ai/ai.service.js');
const {
  CustomerReplyFormatterService,
} = require('../dist/src/modules/ai/formatters/customer-reply-formatter.service.js');
const {
  AiSafetyRulesService,
} = require('../dist/src/modules/ai/policies/ai-safety-rules.service.js');
const {
  CustomerIntentService,
} = require('../dist/src/modules/ai/policies/customer-intent.service.js');
const {
  EscalationDecisionService,
} = require('../dist/src/modules/ai/policies/escalation-decision.service.js');
const {
  HallucinationGuardService,
} = require('../dist/src/modules/ai/policies/hallucination-guard.service.js');
const {
  RetrievalPolicyService,
} = require('../dist/src/modules/rag/policies/retrieval-policy.service.js');
const { RagService } = require('../dist/src/modules/rag/rag.service.js');
const {
  PgvectorRetriever,
} = require('../dist/src/modules/rag/retrievers/pgvector.retriever.js');
const {
  ConversationWindowService,
} = require('../dist/src/modules/whatsapp/policies/conversation-window.service.js');

const SAFE_MISSING_INFO_REPLY =
  'Nous avons bien recu votre demande. Elle necessite une verification complementaire et notre equipe vous repondra des que possible.';
const FORBIDDEN_VISIBLE_PATTERN =
  /base de connaissances|agent humain|handoff|transfert|transmettre votre demande|escalade|RAG|source ID|article ID|metadata|support interne|review interne|internal notes/i;

function assertNoInternalLeak(reply) {
  const visibleText = [reply.answer, reply.replyText].filter(Boolean).join(' ');

  assert.doesNotMatch(visibleText, FORBIDDEN_VISIBLE_PATTERN);
}

function evidence(id, companyId, category, title, content, metadata = {}) {
  return {
    id,
    content,
    score: 0.92,
    metadata: {
      id,
      companyId,
      category,
      articleTitle: title,
      metadata,
    },
  };
}

const flavoServicesEvidence = evidence(
  'flavo-services',
  'company-flavonation',
  'SERVICES',
  'Services proposés',
  'FlavoNation propose la commande de repas via WhatsApp, la consultation des plats disponibles, les informations sur les prix, la livraison selon la zone couverte, le paiement selon les modes acceptés, la confirmation de disponibilité avant validation et l’assistance client via WhatsApp.',
);

const flavoPriceEvidence = evidence(
  'flavo-prices',
  'company-flavonation',
  'PRIX',
  'Prix et tarifs',
  'Prix indicatifs FlavoNation : Pizza 20 TND, Couscous tunisien 18 TND, Burger 15 TND, Sushi ou plat japonais selon disponibilité à partir de 25 TND, Plat indien 22 TND, Plat italien 20 TND, Plat mexicain 21 TND.',
  {
    pricedItems: {
      pizza: '20 TND',
      'couscous tunisien': '18 TND',
      burger: '15 TND',
      sushi: 'à partir de 25 TND',
      'plat japonais': 'à partir de 25 TND',
      'plat indien': '22 TND',
      'plat italien': '20 TND',
      'plat mexicain': '21 TND',
    },
  },
);

const flavoDishesEvidence = evidence(
  'flavo-dishes',
  'company-flavonation',
  'PLATS_DISPONIBLES',
  'Plats internationaux disponibles',
  'FlavoNation propose des plats inspirés de cuisines internationales selon disponibilité : tunisienne, italienne, japonaise, indienne, mexicaine, américaine et méditerranéenne. Nous pouvons proposer des plats d’inspiration japonaise selon disponibilité, par exemple sushi ou plats similaires.',
  {
    availableItems: [
      'couscous tunisien',
      'pizza',
      'burger',
      'sushi',
      'plat japonais',
      'plat indien',
      'plat italien',
      'plat mexicain',
    ],
  },
);

const flavoDeliveryEvidence = evidence(
  'flavo-delivery',
  'company-flavonation',
  'LIVRAISON',
  'Livraison et zones couvertes',
  'FlavoNation livre selon les zones disponibles. Livraison possible à Sfax selon disponibilité. La livraison internationale depuis ou vers le Japon n’est pas confirmée par défaut. Si le client mentionne Japon, le bot doit demander s’il parle de plats japonais ou d’une zone de livraison.',
);

const flavoOrderEvidence = evidence(
  'flavo-order',
  'company-flavonation',
  'COMMANDE',
  'Processus de commande',
  'Pour passer une commande, le client doit envoyer le nom du plat souhaité, la quantité, son nom complet, son numéro de téléphone, son adresse de livraison ou sa localisation, et son mode de paiement.',
);

const flavoPaymentEvidence = evidence(
  'flavo-payment',
  'company-flavonation',
  'PAIEMENT',
  'Modes de paiement',
  'FlavoNation peut accepter le paiement en espèces à la livraison, le paiement PayPal, ou un autre mode à confirmer avec l’équipe.',
  { paymentMethods: ['espèces à la livraison', 'PayPal'] },
);

const techNovaServicesEvidence = evidence(
  'technova-services',
  'company-technova',
  'SERVICES',
  'Services TechNova',
  'TechNova propose le diagnostic informatique, l’installation réseau et la maintenance serveur.',
  {
    availableItems: [
      'diagnostic informatique',
      'installation réseau',
      'maintenance serveur',
    ],
  },
);

function buildConversation(id, companyId, contactId) {
  return {
    id,
    companyId,
    status: 'bot_active',
    assignedTo: null,
    botPaused: false,
    handoffRequired: false,
    lastCustomerMessageAt: new Date(),
    conversationSummary: null,
    customerIntent: null,
    requestedProductService: null,
    requestedDeliveryDate: null,
    nextAction: null,
    importantNotes: null,
    contact: {
      id: contactId,
      fullName: 'Client Test',
      whatsappName: 'Client Test',
      language: null,
    },
    messages: [],
  };
}

function createAiService(ragCalls) {
  const conversations = {
    'conv-flavonation': buildConversation(
      'conv-flavonation',
      'company-flavonation',
      'contact-flavo',
    ),
    'conv-technova': buildConversation(
      'conv-technova',
      'company-technova',
      'contact-tech',
    ),
    'conv-empty': buildConversation('conv-empty', 'company-empty', 'contact-empty'),
  };
  const companyNames = {
    'company-flavonation': 'FlavoNation',
    'company-technova': 'TechNova',
    'company-empty': 'EmptyCo',
  };

  const prisma = {
    conversation: {
      findFirst: async ({ where }) => {
        const conversation = conversations[where.id];

        if (!conversation) return null;
        if (where.companyId && where.companyId !== conversation.companyId) {
          return null;
        }

        return conversation;
      },
      update: async ({ where, data }) => {
        const conversation = conversations[where.id];
        Object.assign(conversation, data);
        return conversation;
      },
    },
    company: {
      findUnique: async ({ where }) => ({ name: companyNames[where.id] ?? null }),
    },
    notification: {
      findFirst: async () => null,
      create: async () => ({ id: 'notification-test' }),
    },
  };

  const gemini = {
    generateText: async ({ prompt, model }) => {
      const message = (
        prompt.match(/Incoming customer message:\n([\s\S]*?)\n\nSignals:/)?.[1] ??
        prompt.match(/Customer message:\n([\s\S]*?)$/)?.[1] ??
        ''
      ).toLowerCase();
      const source =
        prompt.match(/Allowed source ids:\n([^\n]+)/)?.[1]?.split(',')[0]?.trim() ||
        'test-source';
      const answer = (text, extra = {}) => ({
        text: JSON.stringify({
          intent: extra.intent ?? 'ASK_SERVICES',
          answer: text,
          requestedProductService: extra.requestedProductService ?? null,
          requestedDeliveryDate: null,
          nextAction: extra.nextAction ?? 'ai_answer_sent',
          confidence: extra.confidence ?? 0.9,
          handoffRequired: extra.handoffRequired ?? false,
          needsClarification: extra.needsClarification ?? false,
          sources: [source],
          tagsToApply: extra.tagsToApply ?? ['rag'],
          reason: extra.reason ?? 'answered_from_knowledge_base',
        }),
        model: model ?? 'gemini-2.5-flash',
        usage: null,
      });

      if (prompt.includes('TechNova')) {
        return answer(
          'TechNova propose le diagnostic informatique, l’installation réseau et la maintenance serveur.',
          { intent: 'ASK_SERVICES' },
        );
      }

      if (message.includes('services')) {
        return answer(
          'Nous proposons la commande de repas internationaux via WhatsApp, la consultation des plats disponibles, les informations sur les prix, la livraison selon la zone couverte, plusieurs modes de paiement selon disponibilité, ainsi qu’une assistance client. Toute commande est vérifiée avant confirmation.',
          { intent: 'ASK_SERVICES' },
        );
      }

      if (message.includes('paypal') || message.includes('paiement')) {
        return answer(
          'Le paiement PayPal peut être accepté selon disponibilité, ainsi que le paiement en espèces à la livraison. Le mode de paiement sera vérifié avant confirmation finale.',
          { intent: 'ASK_PAYMENT', tagsToApply: ['payment'] },
        );
      }

      if (message.includes('bonsoir')) {
        return answer('Bonsoir, comment puis-je vous aider ?', {
          intent: 'GREETING',
          tagsToApply: ['social'],
        });
      }

      return answer('Je peux vous aider avec les informations disponibles.', {
        intent: 'UNKNOWN',
      });
    },
  };

  const rag = {
    query: async ({ query, intent, companyId, allowedCategories }) => {
      ragCalls.push({ query, intent, companyId, allowedCategories });

      if (companyId === 'company-empty') {
        return {
          answer: '',
          context: '',
          sources: [],
          confidence: 0,
          hasReliableSources: false,
          evidences: [],
        };
      }

      if (companyId === 'company-technova') {
        return {
          answer: '',
          context: techNovaServicesEvidence.content,
          sources: [techNovaServicesEvidence.id],
          confidence: techNovaServicesEvidence.score,
          hasReliableSources: true,
          evidences: [techNovaServicesEvidence],
        };
      }

      const evidenceByIntent = {
        ASK_SERVICES: [flavoServicesEvidence],
        ASK_PRICE: [flavoPriceEvidence],
        ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS: [
          flavoDeliveryEvidence,
          flavoDishesEvidence,
        ],
        ASK_DELIVERY: [flavoDeliveryEvidence],
        ASK_PAYMENT: [flavoPaymentEvidence],
        ASK_ORDER: [flavoOrderEvidence],
        ASK_DISH_AVAILABILITY: [flavoDishesEvidence],
        ASK_MENU: [flavoDishesEvidence],
      };
      const evidences = evidenceByIntent[intent] ?? [flavoServicesEvidence];

      return {
        answer: '',
        context: evidences.map((item) => item.content).join('\n'),
        sources: evidences.map((item) => item.id),
        confidence: 0.92,
        hasReliableSources: true,
        evidences,
      };
    },
  };
  const aiRuns = {
    create: async () => ({ id: 'ai-run-test' }),
  };
  const productVision = {
    analyzeAndMatch: async () => {
      throw new Error('Product vision should not be called by text examples');
    },
    buildReplyFromMatch: () => {
      throw new Error('Product vision should not be called by text examples');
    },
  };

  const service = new AiService(
    prisma,
    gemini,
    rag,
    aiRuns,
    new AiSafetyRulesService(),
    new CustomerIntentService(),
    new EscalationDecisionService(),
    new HallucinationGuardService(),
    new ConversationWindowService(),
    new CustomerReplyFormatterService(),
    productVision,
  );
  service.__testConversations = conversations;

  return service;
}

function resetConversation(service, id = 'conv-flavonation') {
  const conversation = service.__testConversations[id];
  conversation.status = 'bot_active';
  conversation.handoffRequired = false;
  conversation.botPaused = false;
  conversation.assignedTo = null;
  conversation.customerIntent = null;
  conversation.nextAction = null;
  conversation.messages = [];
}

function payload(message, extra = {}) {
  return {
    message,
    conversationId: 'conv-flavonation',
    companyId: 'company-flavonation',
    contactId: 'contact-flavo',
    channel: 'whatsapp',
    direction: 'inbound',
    messageType: 'text',
    ...extra,
  };
}

async function assertRetrieverUsesCompanyId(intentService) {
  let capturedWhere = null;
  const fakeChunks = [
    {
      id: 'chunk-a',
      companyId: 'company-a',
      articleId: 'article-a',
      chunkIndex: 0,
      chunkText: 'AlphaCo propose diagnostic informatique et installation réseau.',
      metadataJson: null,
      article: {
        companyId: 'company-a',
        title: 'Services AlphaCo',
        category: 'SERVICES',
        tags: [],
        language: null,
        status: 'published',
        sourceUrl: null,
      },
    },
    {
      id: 'chunk-b',
      companyId: 'company-b',
      articleId: 'article-b',
      chunkIndex: 0,
      chunkText: 'BetaCo propose pizza et couscous tunisien.',
      metadataJson: null,
      article: {
        companyId: 'company-b',
        title: 'Menu BetaCo',
        category: 'PLATS_DISPONIBLES',
        tags: [],
        language: null,
        status: 'published',
        sourceUrl: null,
      },
    },
  ];
  const fakePrisma = {
    kbChunk: {
      findMany: async (args) => {
        capturedWhere = args.where;
        const companyFilter = args.where.AND.find(
          (filter) => filter.article?.companyId,
        )?.article.companyId;

        return fakeChunks.filter(
          (chunk) => chunk.article.companyId === companyFilter,
        );
      },
    },
  };
  const retriever = new PgvectorRetriever(fakePrisma);
  const results = await retriever.retrieve('services diagnostic', 5, {
    companyId: 'company-a',
    allowedCategories: intentService.getCompatibleCategories('ASK_SERVICES'),
  });

  assert.ok(
    JSON.stringify(capturedWhere).includes('"companyId":"company-a"'),
    'retriever query must include the requested companyId',
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].metadata.companyId, 'company-a');
  assert.equal(results[0].metadata.articleTitle, 'Services AlphaCo');
}

async function runScenarios() {
  const intentService = new CustomerIntentService();

  assert.equal(intentService.detectIntent('Bonsoir'), 'GREETING');
  assert.equal(intentService.detectIntent('Quels sont vos services ?'), 'ASK_SERVICES');
  assert.equal(intentService.detectIntent('Prix de pizza'), 'ASK_PRICE');
  assert.equal(
    intentService.detectIntent('Vous livrez de japon !?'),
    'ASK_DELIVERY_OR_PRODUCT_AMBIGUOUS',
  );
  assert.equal(
    intentService.detectIntent('Je veux passer une commande'),
    'ASK_ORDER',
  );
  assert.equal(intentService.detectIntent('Merci d’avance'), 'CUSTOMER_DONE');
  assert.equal(intentService.detectIntent('Vous acceptez PayPal ?'), 'ASK_PAYMENT');
  assert.notEqual(
    intentService.detectIntent(
      'Noura tahri un pizza sfax tunisia 52 385 206 paiement PayPal',
    ),
    'ASK_ORDER',
  );

  const retrievalPolicy = new RetrievalPolicyService();
  const filtered = retrievalPolicy.filter(
    [
      { score: 0.9, metadata: { category: 'SERVICES' } },
      {
        score: 0.95,
        metadata: {
          category: 'SÉCURITÉ_ALIMENTAIRE',
          metadata: { internalOnly: true },
        },
      },
    ],
    {
      intent: 'ASK_SERVICES',
      allowedCategories: intentService.getCompatibleCategories('ASK_SERVICES'),
    },
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].metadata.category, 'SERVICES');

  const ragWithoutCompany = await new RagService(
    {
      retrieve: async () => {
        throw new Error('Retriever must not be called without companyId');
      },
    },
    retrievalPolicy,
    {
      searchProducts: async () => {
        throw new Error('Product search must not be called without companyId');
      },
    },
  ).query({
    query: 'services',
    allowedCategories: intentService.getCompatibleCategories('ASK_SERVICES'),
  });
  assert.equal(ragWithoutCompany.hasReliableSources, false);
  assert.equal(ragWithoutCompany.evidences.length, 0);

  await assertRetrieverUsesCompanyId(intentService);

  const ragCalls = [];
  const aiService = createAiService(ragCalls);

  const greetingReply = await aiService.generateReply(payload('Bonsoir'));
  assert.equal(greetingReply.intent, 'GREETING');
  assert.equal(greetingReply.handoffRequired, false);
  assert.equal(greetingReply.shouldSendMessage, true);
  assert.match(greetingReply.replyText ?? '', /Bonsoir, comment puis-je vous aider/i);

  const servicesReply = await aiService.generateReply(
    payload('Quels sont vos services ?', { companyId: 'company-other-ignored' }),
  );
  assert.equal(servicesReply.intent, 'SERVICES_QUERY');
  assert.equal(servicesReply.shouldSendMessage, true);
  assert.equal(servicesReply.handoffRequired, false);
  assert.match(servicesReply.replyText ?? '', /commande de repas internationaux/i);
  assert.match(servicesReply.replyText ?? '', /livraison selon la zone/i);
  assertNoInternalLeak(servicesReply);

  const priceReply = await aiService.generateReply(payload('Prix de pizza'));
  assert.equal(priceReply.intent, 'PRICE_QUERY');
  assert.equal(priceReply.shouldSendMessage, true);
  assert.equal(priceReply.handoffRequired, false);
  assert.match(priceReply.replyText ?? '', /20 TND/i);
  assert.match(priceReply.replyText ?? '', /options, la quantité et la disponibilité/i);
  assertNoInternalLeak(priceReply);

  const ambiguousDeliveryReply = await aiService.generateReply(
    payload('Vous livrez de japon !?'),
  );
  assert.equal(
    ambiguousDeliveryReply.intent,
    'DELIVERY_OR_PRODUCT_AMBIGUOUS_QUERY',
  );
  assert.equal(ambiguousDeliveryReply.shouldSendMessage, true);
  assert.equal(ambiguousDeliveryReply.handoffRequired, false);
  assert.equal(ambiguousDeliveryReply.needsClarification, true);
  assert.match(ambiguousDeliveryReply.replyText ?? '', /plats japonais/i);
  assert.match(ambiguousDeliveryReply.replyText ?? '', /adresse ou localisation/i);
  assert.notEqual(ambiguousDeliveryReply.intent, 'ORDER_REQUEST');
  assert.notEqual(ambiguousDeliveryReply.intent, 'ORDER_DETAILS_RECEIVED');
  assertNoInternalLeak(ambiguousDeliveryReply);

  const orderRequestReply = await aiService.generateReply(
    payload('Je veux passer une commande'),
  );
  assert.equal(orderRequestReply.intent, 'ORDER_REQUEST');
  assert.equal(orderRequestReply.shouldSendMessage, true);
  assert.equal(orderRequestReply.handoffRequired, false);
  assert.match(orderRequestReply.replyText ?? '', /nom des plats souhaités/i);
  assert.match(orderRequestReply.replyText ?? '', /quantités/i);
  assert.match(orderRequestReply.replyText ?? '', /numéro de téléphone/i);
  assert.match(orderRequestReply.replyText ?? '', /adresse de livraison/i);
  assert.match(orderRequestReply.replyText ?? '', /mode de paiement/i);
  assertNoInternalLeak(orderRequestReply);

  resetConversation(aiService);
  aiService.__testConversations['conv-flavonation'].messages = [
    {
      id: 'previous-order-info-request',
      direction: 'outbound',
      senderType: 'bot',
      content:
        'Pour passer une commande, veuillez m’envoyer le nom des plats souhaités, les quantités, votre nom, votre numéro de téléphone, votre adresse de livraison ou localisation, et votre mode de paiement.',
      messageType: 'text',
    },
  ];

  const orderDetailsReply = await aiService.generateReply(
    payload('Noura tahri un pizza sfax tunisia 52 385 206 paiement PayPal'),
  );
  assert.equal(orderDetailsReply.intent, 'ORDER_DETAILS_RECEIVED');
  assert.equal(orderDetailsReply.shouldSendMessage, true);
  assert.equal(orderDetailsReply.handoffRequired, true);
  assert.equal(orderDetailsReply.reason, 'order_details_received');
  assert.equal(orderDetailsReply.metadata?.paymentMethod, 'PayPal');
  assert.match(orderDetailsReply.replyText ?? '', /bien reçu vos informations de commande/i);
  assert.match(orderDetailsReply.replyText ?? '', /mode de paiement/i);
  assertNoInternalLeak(orderDetailsReply);

  resetConversation(aiService);
  const noContextOrderDetailsReply = await aiService.generateReply(
    payload('Noura tahri un pizza sfax tunisia 52 385 206 paiement PayPal'),
  );
  assert.notEqual(noContextOrderDetailsReply.intent, 'ORDER_DETAILS_RECEIVED');
  assertNoInternalLeak(noContextOrderDetailsReply);

  const thanksReply = await aiService.generateReply(payload('Merci d’avance'));
  assert.equal(thanksReply.intent, 'THANK_YOU');
  assert.equal(thanksReply.shouldSendMessage, true);
  assert.equal(thanksReply.handoffRequired, false);
  assert.match(thanksReply.replyText ?? '', /De rien/i);
  assertNoInternalLeak(thanksReply);

  resetConversation(aiService, 'conv-technova');
  const techNovaReply = await aiService.generateReply(
    payload('Quels sont vos services ?', {
      conversationId: 'conv-technova',
      companyId: 'company-technova',
      contactId: 'contact-tech',
    }),
  );
  assert.equal(techNovaReply.intent, 'SERVICES_QUERY');
  assert.match(techNovaReply.answer, /diagnostic informatique|installation réseau|maintenance serveur/i);
  assert.doesNotMatch(techNovaReply.answer, /pizza|couscous|sushi|FlavoNation/i);

  resetConversation(aiService, 'conv-empty');
  const emptyCompanyReply = await aiService.generateReply(
    payload('Prix de pizza', {
      conversationId: 'conv-empty',
      companyId: 'company-empty',
      contactId: 'contact-empty',
    }),
  );
  assert.equal(emptyCompanyReply.handoffRequired, true);
  assert.equal(emptyCompanyReply.shouldSendMessage, true);
  assert.equal(emptyCompanyReply.replyText, SAFE_MISSING_INFO_REPLY);
  assert.doesNotMatch(emptyCompanyReply.answer, /20 TND|FlavoNation|diagnostic/i);
  assertNoInternalLeak(emptyCompanyReply);

  assert.ok(
    ragCalls.every((call) =>
      ['company-flavonation', 'company-technova', 'company-empty'].includes(
        call.companyId,
      ),
    ),
    'AI service must scope every RAG call to the resolved conversation company',
  );
  assert.ok(
    ragCalls.some(
      (call) =>
        call.query.includes('Quels sont vos services') &&
        call.companyId === 'company-flavonation',
    ),
    'FlavoNation services query must use FlavoNation companyId',
  );
  assert.ok(
    ragCalls.some((call) => call.companyId === 'company-technova'),
    'multi-company scenario must query the second company',
  );
  assert.ok(
    ragCalls.every((call) => Array.isArray(call.allowedCategories)),
    'AI service must pass allowed categories to RAG',
  );

  console.log('FlavoNation AI/RAG scenarios passed.');
}

runScenarios().catch((error) => {
  console.error(error);
  process.exit(1);
});
