import assert from 'node:assert/strict';

const { AiService } = require('../dist/src/modules/ai/ai.service.js') as {
  AiService: new (...args: unknown[]) => {
    generateReply: (
      payload: Record<string, unknown>,
      actor?: unknown,
      options?: { enforceWorkflowPayload?: boolean },
    ) => Promise<Record<string, any>>;
  };
};
const { AiProviderService } = require(
  '../dist/src/modules/ai/providers/ai-provider.service.js',
) as {
  AiProviderService: new (...args: unknown[]) => {
    generateAnswer: (input: Record<string, unknown>) => Promise<Record<string, any>>;
  };
};
const { PgvectorRetriever } = require(
  '../dist/src/modules/rag/retrievers/pgvector.retriever.js',
) as {
  PgvectorRetriever: new (...args: unknown[]) => {
    retrieve: (
      query: string,
      topK: number,
      options?: Record<string, unknown>,
    ) => Promise<Array<{ score?: number; metadata?: Record<string, any> }>>;
  };
};

type Tenant = {
  companyId: string;
  contactId: string;
  conversationId: string;
  instanceName: string;
  companyName: string;
  sourceId: string;
  evidence: string;
};

type OrderItem = {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  currency: string | null;
  subtotal: number | null;
  availability: string | null;
};

type OrderDetails = {
  actionType: string | null;
  customerName: string | null;
  requestedItem: string | null;
  quantity: string | null;
  requestedDate: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  items: OrderItem[];
  total: number | null;
  currency: string | null;
  availability: string | null;
  confirmationStatus: string | null;
  missingFields: string[];
  checkInDate: string | null;
  checkOutDate: string | null;
  nights: number | null;
  numberOfAdults: number | null;
  numberOfChildren: number | null;
  childrenAges: string | null;
  roomType: string | null;
  boardFormula: string | null;
  numberOfRooms: number | null;
  selectedChoice: string | null;
};

type Scenario = {
  message: string;
  normalizedMessage: string;
  detectedLanguage: string;
  intent: string;
  keywordsForSearch: string[];
  orderDetails: OrderDetails;
  orderIntent?: boolean;
  noEvidence?: boolean;
  sequenceStep?: boolean;
};

const TENANTS: Tenant[] = [
  {
    companyId: 'company-alpha',
    contactId: 'contact-alpha',
    conversationId: 'conversation-alpha',
    instanceName: 'alpha-instance',
    companyName: 'Alpha Services',
    sourceId: 'kb-alpha',
    evidence:
      'Alpha Services offers Alpha-only assistance and Alpha-only conditions. Standard Room rate: 115 TND.',
  },
  {
    companyId: 'company-beta',
    contactId: 'contact-beta',
    conversationId: 'conversation-beta',
    instanceName: 'beta-instance',
    companyName: 'Beta Solutions',
    sourceId: 'kb-beta',
    evidence:
      'Beta Solutions offers Beta-only assistance and Beta-only conditions. Standard Room rate: 125 TND.',
  },
];

const EMPTY_ORDER_DETAILS: OrderDetails = {
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
  nights: null,
  numberOfAdults: null,
  numberOfChildren: null,
  childrenAges: null,
  roomType: null,
  boardFormula: null,
  numberOfRooms: null,
  selectedChoice: null,
};

const SCENARIOS: Scenario[] = [
  {
    message: 'qules sont les plats',
    normalizedMessage: 'Quels sont les produits disponibles ?',
    detectedLanguage: 'fr',
    intent: 'OFFERINGS_QUERY',
    keywordsForSearch: ['produits disponibles', 'offres', 'catalogue'],
    orderDetails: EMPTY_ORDER_DETAILS,
  },
  {
    message: 'zone couverte',
    normalizedMessage: 'Quelles zones sont desservies ?',
    detectedLanguage: 'fr',
    intent: 'DELIVERY_COVERAGE_QUERY',
    keywordsForSearch: [
      'livraison',
      'zones couvertes',
      'zones desservies',
      'delivery area',
      'villes couvertes',
    ],
    orderDetails: EMPTY_ORDER_DETAILS,
  },
  {
    message: 'localisation',
    normalizedMessage: 'Quelle est la localisation disponible pour le service demande ?',
    detectedLanguage: 'fr',
    intent: 'LOCATION_QUERY',
    keywordsForSearch: ['localisation', 'adresse', 'zone de service'],
    orderDetails: EMPTY_ORDER_DETAILS,
  },
  {
    message: 'win touslou',
    normalizedMessage: 'Dans quelles zones livrez-vous ?',
    detectedLanguage: 'tunisian_arabic_latin',
    intent: 'DELIVERY_COVERAGE_QUERY',
    keywordsForSearch: ['zones desservies', 'livraison', 'delivery area'],
    orderDetails: EMPTY_ORDER_DETAILS,
  },
  {
    message: 'شنوة الخدمات',
    normalizedMessage: 'Quels services proposez-vous ?',
    detectedLanguage: 'tunisian_arabic',
    intent: 'SERVICES_QUERY',
    keywordsForSearch: ['services', 'offres', 'الخدمات'],
    orderDetails: EMPTY_ORDER_DETAILS,
  },
  {
    message: 'prix svp',
    normalizedMessage: 'Quels sont les tarifs ?',
    detectedLanguage: 'fr',
    intent: 'PRICE_QUERY',
    keywordsForSearch: ['prix', 'tarifs', 'pricing'],
    orderDetails: EMPTY_ORDER_DETAILS,
  },
  {
    message: 'tarifs hotel sans sources',
    normalizedMessage: "Quels sont les tarifs de l'hotel ?",
    detectedLanguage: 'fr',
    intent: 'PRICE_QUERY',
    keywordsForSearch: ['tarifs hotel', 'prix', 'hotel'],
    orderDetails: EMPTY_ORDER_DETAILS,
    sequenceStep: true,
  },
  {
    message: 'nheb ncommandi',
    normalizedMessage: 'Je souhaite passer une commande.',
    detectedLanguage: 'tunisian_arabic_latin',
    intent: 'ORDER_REQUEST',
    keywordsForSearch: ['commande', 'achat', 'conditions'],
    orderIntent: true,
    orderDetails: {
      ...EMPTY_ORDER_DETAILS,
      actionType: 'order',
      confirmationStatus: 'collecting_details',
      missingFields: ['customerName', 'phone', 'address', 'items'],
    },
  },
  {
    message: 'je veux réserver',
    normalizedMessage: 'Je souhaite effectuer une reservation.',
    detectedLanguage: 'fr',
    intent: 'RESERVATION_REQUEST',
    keywordsForSearch: ['reservation', 'disponibilite', 'conditions'],
    orderIntent: true,
    orderDetails: {
      ...EMPTY_ORDER_DETAILS,
      actionType: 'reservation',
      confirmationStatus: 'collecting_details',
      missingFields: [
        'checkInDate',
        'checkOutDate',
        'numberOfAdults',
        'numberOfChildren',
        'roomType',
      ],
    },
  },
  {
    message: 'je veux un devis',
    normalizedMessage: 'Je souhaite demander un devis.',
    detectedLanguage: 'fr',
    intent: 'QUOTE_REQUEST',
    keywordsForSearch: ['devis', 'tarifs', 'conditions'],
    orderIntent: true,
    orderDetails: {
      ...EMPTY_ORDER_DETAILS,
      actionType: 'quote_request',
      missingFields: ['requestedItem'],
    },
  },
  {
    message: 'rdv demain svp',
    normalizedMessage: 'Je souhaite prendre rendez-vous demain.',
    detectedLanguage: 'fr',
    intent: 'APPOINTMENT_REQUEST',
    keywordsForSearch: ['rendez-vous', 'disponibilite', 'conditions'],
    orderIntent: true,
    orderDetails: {
      ...EMPTY_ORDER_DETAILS,
      actionType: 'appointment',
      requestedDate: 'demain',
      missingFields: ['requestedItem'],
    },
  },
  {
    message: 'what services do you offer',
    normalizedMessage: 'What services do you offer?',
    detectedLanguage: 'en',
    intent: 'SERVICES_QUERY',
    keywordsForSearch: ['services', 'offerings'],
    orderDetails: EMPTY_ORDER_DETAILS,
  },
  {
    message: 'information introuvable',
    normalizedMessage: 'Je demande une information non documentee.',
    detectedLanguage: 'fr',
    intent: 'BUSINESS_QUERY',
    keywordsForSearch: ['information non documentee'],
    orderDetails: EMPTY_ORDER_DETAILS,
    noEvidence: true,
  },
  {
    message: 'a7ki ground failure',
    normalizedMessage: 'Le client souhaite poursuivre sa demande.',
    detectedLanguage: 'tunisian_arabic_latin',
    intent: 'ORDER_REQUEST',
    keywordsForSearch: ['commande', 'article demande'],
    orderIntent: true,
    sequenceStep: true,
    orderDetails: {
      ...EMPTY_ORDER_DETAILS,
      actionType: 'order',
      customerName: 'Client Test',
      phone: '00000000',
      address: 'Adresse test',
      items: [
        {
          name: 'article demande',
          quantity: 1,
          unitPrice: null,
          currency: null,
          subtotal: null,
          availability: null,
        },
      ],
      missingFields: [],
    },
  },
];

const ragCalls: Array<Record<string, unknown>> = [];
const aiRuns: Array<Record<string, unknown>> = [];
const conversationUpdates: Array<Record<string, unknown>> = [];
const contactUpdates: Array<Record<string, unknown>> = [];
const conversationTagUpserts: Array<Record<string, unknown>> = [];
const contactTags = new Map(TENANTS.map((tenant) => [tenant.contactId, [] as string[]]));
const conversationDecisionState = new Map(
  TENANTS.map((tenant) => [tenant.conversationId, null as string | null]),
);
let retryJsonAttempts = 0;

function tenantByCompany(companyId: string): Tenant {
  const tenant = TENANTS.find((item) => item.companyId === companyId);
  assert.ok(tenant, `Unknown tenant: ${companyId}`);
  return tenant;
}

function scenarioFromPrompt(prompt: string): Scenario {
  const scenario = SCENARIOS.find((item) =>
    prompt.includes(`Incoming customer message:\n${item.message}`),
  );
  assert.ok(scenario, `Missing scenario for prompt: ${prompt.slice(0, 100)}`);
  return scenario;
}

function structuredDecision(
  scenario: Scenario,
  partial: Partial<Record<string, unknown>> = {},
) {
  const fallbackUsed = scenario.message === 'prix svp';
  const provider = fallbackUsed ? 'gemini' : 'openrouter';
  const model = fallbackUsed
    ? 'gemini-2.5-flash'
    : 'openrouter/free';

  return {
    text: JSON.stringify({
      normalizedMessage: scenario.normalizedMessage,
      detectedLanguage: scenario.detectedLanguage,
      intent: scenario.intent,
      needsRag: true,
      canAnswer: false,
      handoffRequired: false,
      orderIntent: scenario.orderIntent === true,
      orderDetails: scenario.orderDetails,
      replyDraft: '',
      reply: '',
      keywordsForSearch: scenario.keywordsForSearch,
      sources: [],
      confidence: 0.96,
      reason: null,
      ...partial,
    }),
    provider,
    model,
    fallbackUsed,
    errorMessage: fallbackUsed
      ? 'openrouter: OPENROUTER_RATE_LIMIT'
      : undefined,
    attempts: [
      ...(fallbackUsed
        ? [
            {
              provider: 'openrouter',
              model: 'openrouter/free',
              success: false,
              latencyMs: 4,
              errorMessage: 'OPENROUTER_RATE_LIMIT',
              errorReason: 'quota_exceeded',
            },
          ]
        : []),
      { provider, model, success: true, latencyMs: 3 },
    ],
    rawResponse: { finishReason: 'stop' },
    usage: {
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
    },
  };
}

function localizedGroundedReply(scenario: Scenario, tenant: Tenant): string {
  if (scenario.orderIntent === true) {
    if (scenario.detectedLanguage === 'tunisian_arabic_latin') {
      return `${tenant.companyName}: nfassloulek l ma3loumet l ne9sa bech nkamlou.`;
    }

    if (
      scenario.detectedLanguage === 'tunisian_arabic' ||
      scenario.detectedLanguage === 'ar'
    ) {
      return `${tenant.companyName}: \u0633\u0646\u0648\u0636\u062d \u0644\u0643 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0646\u0627\u0642\u0635\u0629 \u0644\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u0637\u0644\u0628.`;
    }

    if (scenario.detectedLanguage === 'en') {
      return `${tenant.companyName} has noted your request. Please share the missing details so we can continue.`;
    }

    return `${tenant.companyName} a bien pris en compte votre demande. Precisez les elements manquants pour continuer.`;
  }

  if (scenario.detectedLanguage === 'tunisian_arabic_latin') {
    return `${tenant.companyName}: el ma3louma mathbouta men source mte3na.`;
  }

  if (
    scenario.detectedLanguage === 'tunisian_arabic' ||
    scenario.detectedLanguage === 'ar'
  ) {
    return `${tenant.companyName}: \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0629 \u0645\u0624\u0643\u062f\u0629 \u0645\u0646 \u0645\u0635\u062f\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.`;
  }

  if (scenario.detectedLanguage === 'en') {
    return `${tenant.companyName}: confirmed from its private knowledge.`;
  }

  return `${tenant.companyName} : information confirmee par sa base privee.`;
}

function createPrismaMock() {
  return {
    conversation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const tenant = TENANTS.find((item) => item.conversationId === where.id);
        return tenant
          ? {
              id: tenant.conversationId,
              companyId: tenant.companyId,
              contactId: tenant.contactId,
              lastCustomerMessageAt: new Date(),
              lastAiDecision:
                conversationDecisionState.get(tenant.conversationId) ?? null,
              messages: [],
            }
          : null;
      },
      update: async (request: Record<string, unknown>) => {
        const where = request.where as { id?: string } | undefined;
        const data = request.data as { lastAiDecision?: string } | undefined;
        if (where?.id && data?.lastAiDecision) {
          conversationDecisionState.set(where.id, data.lastAiDecision);
        }
        conversationUpdates.push(request);
        return request;
      },
    },
    contact: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; companyId: string };
      }) => {
        const tenant = TENANTS.find(
          (item) => item.contactId === where.id && item.companyId === where.companyId,
        );
        return tenant
          ? { id: tenant.contactId, tags: contactTags.get(tenant.contactId) ?? [] }
          : null;
      },
      update: async (request: {
        where: { id: string };
        data: { tags: string[] };
      }) => {
        contactTags.set(request.where.id, request.data.tags);
        contactUpdates.push(request as unknown as Record<string, unknown>);
        return request;
      },
    },
    message: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; conversationId: string; companyId: string };
      }) => {
        const tenant = TENANTS.find(
          (item) =>
            item.conversationId === where.conversationId &&
            item.companyId === where.companyId &&
            where.id.startsWith(`message-${item.companyId}-`),
        );
        return tenant ? { id: where.id } : null;
      },
    },
    conversationTag: {
      upsert: async (request: Record<string, unknown>) => {
        conversationTagUpserts.push(request);
        return request;
      },
    },
    companyWhatsappInstance: {
      findFirst: async ({
        where,
      }: {
        where: { evolutionInstanceName?: string; OR?: Array<{ evolutionInstanceName: string }> };
      }) => {
        const candidates = where.OR?.map((item) => item.evolutionInstanceName) ??
          (where.evolutionInstanceName ? [where.evolutionInstanceName] : []);
        const tenant = TENANTS.find((item) => candidates.includes(item.instanceName));
        return tenant ? { companyId: tenant.companyId } : null;
      },
      findUnique: async ({
        where,
      }: {
        where: { evolutionInstanceName: string };
      }) => {
        const tenant = TENANTS.find(
          (item) => item.instanceName === where.evolutionInstanceName,
        );
        return tenant ? { companyId: tenant.companyId } : null;
      },
    },
    company: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const tenant = TENANTS.find((item) => item.companyId === where.id);
        return tenant ? { id: tenant.companyId, name: tenant.companyName } : null;
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
}

function createProviderMock() {
  return {
    getConfiguredProvider: () => 'openrouter',
    generateAnswer: async ({ userMessage: prompt }: { userMessage: string }) => {
      if (prompt.includes('Incoming customer message:\nsalut')) {
        const response = structuredDecision(SCENARIOS[0], {
          normalizedMessage: 'Bonjour',
          detectedLanguage: 'fr',
          intent: 'GREETING',
          needsRag: false,
          canAnswer: true,
          reply: 'Bonjour ! Comment puis-je vous aider ?',
          keywordsForSearch: [],
        });

        return {
          ...response,
          text: `\`\`\`json\n${response.text}`,
        };
      }

      if (prompt.includes('Incoming customer message:\nerreur technique')) {
        return {
          ...structuredDecision(SCENARIOS[0]),
          text: '```json\n{',
        };
      }

      if (prompt.includes('Incoming customer message:\nquota menu')) {
        throw new Error('RESOURCE_EXHAUSTED');
      }

      if (prompt.includes('Incoming customer message:\nbonjour')) {
        throw new Error('RESOURCE_EXHAUSTED');
      }

      if (
        prompt.includes('Generate the final customer reply') &&
        prompt.includes('Incoming customer message:\na7ki ground failure')
      ) {
        throw new Error('RESOURCE_EXHAUSTED');
      }

      if (
        prompt.includes('Generate the final customer reply') &&
        prompt.includes('Incoming customer message:\ntarifs hotel sans sources')
      ) {
        const scenario = scenarioFromPrompt(prompt);
        return structuredDecision(scenario, {
          canAnswer: true,
          replyDraft: 'Repondre selon les sources disponibles.',
          reply: 'Alpha Services : les tarifs sont confirmes.',
          sources: [],
        });
      }

      if (prompt.includes('Incoming customer message:\nretry json')) {
        retryJsonAttempts += 1;
        const response = structuredDecision(SCENARIOS[0], {
          normalizedMessage: 'Retry succeeded',
          detectedLanguage: 'en',
          intent: 'GREETING',
          needsRag: false,
          canAnswer: true,
          reply: 'Recovered reply.',
          keywordsForSearch: [],
        });

        return retryJsonAttempts === 1
          ? { ...response, text: '```json\n{' }
          : response;
      }

      const scenario = scenarioFromPrompt(prompt);
      if (prompt.includes('Analyze the incoming customer message')) {
        if (scenario.message === 'what services do you offer') {
          return structuredDecision(scenario, {
            needsRag: undefined,
            needsRAG: true,
          });
        }

        return structuredDecision(scenario);
      }

      if (scenario.noEvidence) {
        return structuredDecision(scenario, {
          canAnswer: false,
          handoffRequired: true,
          replyDraft: 'Une verification est necessaire.',
          reply: 'Je dois verifier cette information avant de vous repondre precisement.',
          reason: 'missing_company_evidence',
        });
      }

      const tenant = TENANTS.find((item) => prompt.includes(item.companyName));
      assert.ok(tenant, 'Grounded prompt must retain the scoped company.');
      return structuredDecision(scenario, {
        canAnswer: true,
        replyDraft: `Repondre selon la source de ${tenant.companyName}.`,
        reply: localizedGroundedReply(scenario, tenant),
        sources: [tenant.sourceId],
      });
    },
  };
}

function createRagMock() {
  return {
    query: async (query: Record<string, unknown>) => {
      ragCalls.push(query);
      const tenant = tenantByCompany(String(query.companyId));
      const noEvidence =
        String(query.query).includes('information introuvable') ||
        String(query.query).includes('erreur technique');
      if (noEvidence) {
        return {
          answer: '',
          context: '',
          sources: [],
          confidence: 0,
          hasReliableSources: false,
          evidences: [],
          sourceChunkIds: [],
          sourceArticleIds: [],
          retrievedChunksPreview: [],
        };
      }

      return {
        answer: '',
        context: tenant.evidence,
        sources: [tenant.sourceId],
        confidence: 0.95,
        hasReliableSources: true,
        evidences: [
          {
            id: tenant.sourceId,
            content: tenant.evidence,
            score: 0.95,
            metadata: {
              chunkId: tenant.sourceId,
              articleId: `${tenant.sourceId}-article`,
            },
          },
        ],
        sourceChunkIds: [tenant.sourceId],
        sourceArticleIds: [`${tenant.sourceId}-article`],
        retrievedChunksPreview: [],
      };
    },
  };
}

function createService() {
  return new AiService(
    createPrismaMock() as never,
    createProviderMock() as never,
    createRagMock() as never,
    {
      create: async (data: Record<string, unknown>) => {
        const run = { id: `run-${aiRuns.length + 1}`, ...data };
        aiRuns.push(run);
        return run;
      },
    } as never,
  );
}

function payload(message: string, tenant = TENANTS[0], companyId = tenant.companyId) {
  return {
    message,
    messageText: message,
    messageId: `message-${tenant.companyId}-${message}`,
    conversationId: tenant.conversationId,
    companyId,
    contactId: tenant.contactId,
    contactName: 'Client',
    phoneNumber: '+21600000000',
    instanceName: tenant.instanceName,
    channel: 'whatsapp',
    direction: 'inbound' as const,
    messageType: 'text',
    hasMedia: false,
    rawPayload: {},
  };
}

async function generate(service: InstanceType<typeof AiService>, message: string, tenant = TENANTS[0]) {
  return service.generateReply(payload(message, tenant), undefined, {
    enforceWorkflowPayload: true,
  });
}

async function verifyProviderSelectionAndFallback() {
  const input = {
    systemPrompt: 'Return text.',
    userMessage: 'Hello',
    companyId: 'company-alpha',
    instanceName: 'alpha-instance',
  };
  const createConfig = (values: Record<string, string>) => ({
    get: (key: string) => values[key],
  });
  const execution = (provider: string) => ({
    text: `${provider} answer`,
    provider,
    model:
      provider === 'ollama'
        ? 'llama3.1:latest'
        : provider === 'gemini'
          ? 'gemini-2.5-flash'
          : 'openrouter/free',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  });

  const openrouterCalls: string[] = [];
  const openrouter = new AiProviderService(
    createConfig({
      AI_PROVIDER: 'ollama',
      AI_FALLBACK_PROVIDER: 'ollama',
      OPENROUTER_MODEL: 'openrouter/free',
      GEMINI_MODEL: 'gemini-2.5-flash',
      OLLAMA_MODEL: 'llama3.1:latest',
    }),
  ) as any;
  openrouter.executeProvider = async (provider: string) => {
    openrouterCalls.push(provider);
    return execution(provider);
  };
  const cloudReply = await openrouter.generateAnswer(input);
  assert.deepEqual(openrouterCalls, ['openrouter']);
  assert.equal(cloudReply.provider, 'openrouter');
  assert.equal(cloudReply.fallbackUsed, false);

  const geminiFallbackCalls: string[] = [];
  const geminiFallback = new AiProviderService(
    createConfig({
      OPENROUTER_MODEL: 'openrouter/free',
      GEMINI_MODEL: 'gemini-2.5-flash',
      OLLAMA_MODEL: 'llama3.1:latest',
    }),
  ) as any;
  geminiFallback.executeProvider = async (provider: string) => {
    geminiFallbackCalls.push(provider);
    if (provider === 'openrouter') {
      throw new Error('429 quota exceeded');
    }
    return execution(provider);
  };
  const geminiFallbackReply = await geminiFallback.generateWithFallback(input);
  assert.deepEqual(geminiFallbackCalls, ['openrouter', 'gemini']);
  assert.equal(geminiFallbackReply.provider, 'gemini');
  assert.equal(geminiFallbackReply.fallbackUsed, true);
  assert.match(geminiFallbackReply.errorMessage, /quota exceeded/);
  assert.equal(geminiFallbackReply.attempts[0].errorReason, 'quota_exceeded');

  const emptyFallbackCalls: string[] = [];
  const emptyFallback = new AiProviderService(
    createConfig({
      OPENROUTER_MODEL: 'openrouter/free',
      GEMINI_MODEL: 'gemini-2.5-flash',
      OLLAMA_MODEL: 'llama3.1:latest',
    }),
  ) as any;
  emptyFallback.executeProvider = async (provider: string) => {
    emptyFallbackCalls.push(provider);
    return provider === 'openrouter' ? { ...execution(provider), text: '  ' } : execution(provider);
  };
  const emptyFallbackReply = await emptyFallback.generateAnswer(input);
  assert.deepEqual(emptyFallbackCalls, ['openrouter', 'gemini']);
  assert.equal(emptyFallbackReply.provider, 'gemini');
  assert.equal(emptyFallbackReply.attempts[0].errorReason, 'empty_response');

  const ollamaFallbackCalls: string[] = [];
  const ollamaFallback = new AiProviderService(
    createConfig({
      OPENROUTER_MODEL: 'openrouter/free',
      GEMINI_MODEL: 'gemini-2.5-flash',
      OLLAMA_MODEL: 'llama3.1:latest',
    }),
  ) as any;
  ollamaFallback.executeProvider = async (provider: string) => {
    ollamaFallbackCalls.push(provider);
    if (provider === 'openrouter') {
      throw new Error('401 invalid API key');
    }

    if (provider === 'gemini') {
      throw new Error('RESOURCE_EXHAUSTED quota exceeded');
    }

    return execution(provider);
  };
  const ollamaFallbackReply = await ollamaFallback.generateAnswer(input);
  assert.deepEqual(ollamaFallbackCalls, ['openrouter', 'gemini', 'ollama']);
  assert.equal(ollamaFallbackReply.provider, 'ollama');
  assert.equal(ollamaFallbackReply.fallbackUsed, true);
  assert.match(ollamaFallbackReply.errorMessage, /openrouter/);
  assert.match(ollamaFallbackReply.errorMessage, /gemini/);
  assert.equal(ollamaFallbackReply.attempts[0].errorReason, 'invalid_api_key');
  assert.equal(ollamaFallbackReply.attempts[1].errorReason, 'quota_exceeded');
}

async function verifyRetrieverKeepsBestTextScoreForDuplicateChunks() {
  const chunkText =
    'TARIF B2C hotel Tanfous prix chambre standard 115 TND par nuit.';
  const retriever = new PgvectorRetriever(
    {
      $queryRaw: async () => [
        {
          id: 'chunk-hotel-tarifs',
          company_id: 'company-alpha',
          article_id: 'article-hotel-tarifs',
          chunk_index: 0,
          chunk_text: chunkText,
          metadata_json: null,
          article_company_id: 'company-alpha',
          article_title: 'les Tarifs',
          article_category: 'paiements',
          article_tags: [],
          article_language: 'fr',
          article_status: 'published',
          article_source_url: null,
          score: 0.1,
        },
      ],
      kbChunk: {
        findMany: async () => [
          {
            id: 'chunk-hotel-tarifs',
            companyId: 'company-alpha',
            articleId: 'article-hotel-tarifs',
            chunkIndex: 0,
            chunkText,
            metadataJson: null,
            article: {
              companyId: 'company-alpha',
              title: 'les Tarifs',
              category: 'paiements',
              tags: [],
              language: 'fr',
              status: 'published',
              sourceUrl: null,
            },
          },
        ],
      },
    } as never,
    {
      generateEmbedding: async () => [1],
    } as never,
  );

  const results = await retriever.retrieve('tarifs hotel', 8, {
    companyId: 'company-alpha',
  });

  assert.equal(results.length, 1);
  assert.ok(
    (results[0].score ?? 0) > 0.9,
    'Text score should replace the weaker vector score for the same chunk.',
  );
  assert.deepEqual(results[0].metadata?.matchedTokens, [
    'tarifs',
    'tarif',
    'prix',
    'hotel',
  ]);
}

async function run() {
  await verifyProviderSelectionAndFallback();
  await verifyRetrieverKeepsBestTextScoreForDuplicateChunks();
  const service = createService();
  const fallbackService = service as any;
  const englishAfterArabicHistory = fallbackService.detectFallbackLanguageFromHistory(
    'Do you have sushi? Please answer in English.',
    [{ role: 'user', content: '\u0647\u0644 \u0644\u062f\u064a\u0643\u0645 \u0633\u0648\u0634\u064a\u061f' }],
  );
  assert.equal(englishAfterArabicHistory, 'en');
  assert.match(fallbackService.verificationReply('en'), /exact information/i);
  assert.match(fallbackService.verificationReply('tunisian_arabic'), /[\u0600-\u06ff]/u);
  assert.doesNotMatch(
    fallbackService.verificationReply('tunisian_arabic'),
    /Bech nthabetlek/,
  );
  const answerableScenarios = SCENARIOS.filter(
    (scenario) => !scenario.noEvidence && !scenario.sequenceStep,
  );

  for (const scenario of answerableScenarios) {
    const reply = await generate(service, scenario.message);
    const isGenericHotelPrice = scenario.message === 'prix svp';
    assert.equal(reply.normalizedMessage, scenario.normalizedMessage);
    assert.equal(reply.detectedLanguage, scenario.detectedLanguage);
    assert.equal(reply.intent, scenario.intent);
    assert.equal(reply.needsRag, true);
    assert.equal(reply.canAnswer, true);
    assert.equal(reply.orderIntent, scenario.orderIntent === true);
    assert.equal(reply.shouldSendMessage, true);
    assert.deepEqual(reply.orderDetails, scenario.orderDetails);
    assert.deepEqual(reply.sources, isGenericHotelPrice ? [] : ['kb-alpha']);

    if (isGenericHotelPrice) {
      assert.match(reply.reply, /type de chambre/);
      assert.match(reply.reply, /date du sejour/);
      assert.doesNotMatch(reply.reply, /115 TND/);
    } else if (scenario.detectedLanguage === 'en') {
      assert.match(reply.reply, /confirmed|Please share/i);
      assert.doesNotMatch(reply.reply, /information confirmee/i);
    } else if (scenario.detectedLanguage === 'tunisian_arabic_latin') {
      assert.match(reply.reply, /\b(mte3na|nfassloulek|bech)\b/i);
    } else if (
      scenario.detectedLanguage === 'tunisian_arabic' ||
      scenario.detectedLanguage === 'ar'
    ) {
      assert.match(reply.reply, /[\u0600-\u06ff]/u);
    } else if (scenario.intent === 'PRICE_QUERY') {
      assert.match(reply.reply, /115 TND/);
      assert.doesNotMatch(reply.reply, /Voici les informations disponibles/);
    } else if (scenario.detectedLanguage === 'fr') {
      assert.match(reply.reply, /information confirmee|Precisez|indiquez/i);
    }
  }

  const zoneQuery = String(
    ragCalls.find((call) => String(call.query).includes('zone couverte'))?.query,
  );
  assert.match(zoneQuery, /Quelles zones sont desservies/);
  assert.match(zoneQuery, /delivery area/);
  assert.match(zoneQuery, /villes couvertes/);

  assert.deepEqual(contactTags.get('contact-alpha'), [
    'demande_client',
    'demande_commande',
    'demande_reservation',
    'demande_devis',
    'demande_rendez_vous',
  ]);
  const expectedCustomerRequests = answerableScenarios.filter(
    (scenario) => scenario.orderIntent === true,
  ).length;
  assert.equal(conversationUpdates.length, expectedCustomerRequests);
  assert.equal(contactUpdates.length, expectedCustomerRequests);
  assert.equal(conversationTagUpserts.length, expectedCustomerRequests * 2);
  assert.ok(
    conversationTagUpserts.some((request) =>
      JSON.stringify(request).includes('demande_reservation'),
    ),
  );
  assert.ok(
    conversationTagUpserts.some((request) =>
      JSON.stringify(request).includes('demande_devis'),
    ),
  );
  assert.ok(
    conversationTagUpserts.some((request) =>
      JSON.stringify(request).includes('demande_rendez_vous'),
    ),
  );
  assert.ok(
    conversationUpdates.every((update) =>
      JSON.stringify(update).includes('prepare_customer_request'),
    ),
  );

  const alphaReply = await generate(service, 'what services do you offer', TENANTS[0]);
  const betaReply = await generate(service, 'what services do you offer', TENANTS[1]);
  assert.match(alphaReply.reply, /Alpha Services/);
  assert.doesNotMatch(alphaReply.reply, /Beta Solutions/);
  assert.match(betaReply.reply, /Beta Solutions/);
  assert.doesNotMatch(betaReply.reply, /Alpha Services/);
  assert.deepEqual(alphaReply.sources, ['kb-alpha']);
  assert.deepEqual(betaReply.sources, ['kb-beta']);
  assert.equal(ragCalls[ragCalls.length - 1]?.companyId, 'company-beta');

  const missingReply = await generate(service, 'information introuvable');
  assert.equal(missingReply.canAnswer, false);
  assert.equal(missingReply.handoffRequired, true);
  assert.equal(missingReply.shouldSendMessage, true);
  assert.match(missingReply.reply, /information exacte/);
  assert.match(missingReply.reply, /responsable/);
  assert.deepEqual(missingReply.sources, []);

  const socialBefore = ragCalls.length;
  const socialReply = await generate(service, 'salut');
  assert.equal(socialReply.needsRag, false);
  assert.equal(socialReply.shouldSendMessage, true);
  assert.equal(ragCalls.length, socialBefore);

  const technicalFailureReply = await generate(service, 'erreur technique');
  assert.equal(technicalFailureReply.handoffRequired, true);
  assert.equal(technicalFailureReply.shouldSendMessage, true);
  assert.equal(technicalFailureReply.reason, 'ai_provider_understanding_failed');
  assert.match(technicalFailureReply.reply, /information exacte/);

  const tunisianContextFailureReply = await service.generateReply(
    {
      ...payload('erreur technique'),
      history: [{ role: 'user', content: 'A7ki b tounsi svp' }],
    },
    undefined,
    { enforceWorkflowPayload: true },
  );
  assert.match(tunisianContextFailureReply.reply, /Ma 3andich/);
  assert.match(tunisianContextFailureReply.reply, /responsable/);

  const providerFailureReply = await generate(service, 'quota menu');
  assert.equal(providerFailureReply.shouldSendMessage, true);
  assert.equal(providerFailureReply.handoffRequired, true);
  assert.equal(providerFailureReply.reason, 'ai_provider_understanding_failed');
  assert.doesNotMatch(providerFailureReply.reply, /Alpha-only assistance/);

  const ungroundedSourceReply = await generate(service, 'tarifs hotel sans sources');
  assert.equal(
    ungroundedSourceReply.reason,
    'rag_evidence_fallback_after_ungrounded_llm_reply',
  );
  assert.equal(ungroundedSourceReply.canAnswer, true);
  assert.equal(ungroundedSourceReply.usedKb, true);
  assert.equal(ungroundedSourceReply.responseMode, 'KB_DIRECT_DEBUG');
  assert.deepEqual(ungroundedSourceReply.sources, ['kb-alpha']);
  assert.match(ungroundedSourceReply.reply, /115 TND/);
  assert.doesNotMatch(
    ungroundedSourceReply.reply,
    /Voici les informations disponibles/,
  );

  const groundedFailureReply = await generate(
    service,
    'a7ki ground failure',
    TENANTS[1],
  );
  assert.equal(groundedFailureReply.reason, 'rag_evidence_fallback_after_grounded_failure');
  assert.equal(groundedFailureReply.canAnswer, true);
  assert.equal(groundedFailureReply.usedKb, true);
  assert.equal(groundedFailureReply.responseMode, 'KB_DIRECT_DEBUG');
  assert.equal(groundedFailureReply.orderIntent, true);
  assert.equal(groundedFailureReply.orderDetails.customerName, 'Client Test');
  assert.match(groundedFailureReply.reply, /Hedhi l ma3loumet|Beta Solutions/);

  const retriedReply = await generate(service, 'retry json');
  assert.equal(retryJsonAttempts, 2);
  assert.equal(retriedReply.shouldSendMessage, true);
  assert.equal(retriedReply.reply, 'Recovered reply.');

  const mismatchedTenant = await service.generateReply(
    payload('prix svp', TENANTS[0], TENANTS[1].companyId),
    undefined,
    { enforceWorkflowPayload: true },
  );
  assert.equal(mismatchedTenant.shouldSendMessage, false);
  assert.equal(mismatchedTenant.handoffRequired, true);
  assert.equal(mismatchedTenant.reason, 'company_scope_mismatch');

  const mismatchedMessage = await service.generateReply(
    {
      ...payload('prix svp'),
      messageId: 'message-company-beta-prix svp',
    },
    undefined,
    { enforceWorkflowPayload: true },
  );
  assert.equal(mismatchedMessage.shouldSendMessage, false);
  assert.equal(mismatchedMessage.reason, 'message_scope_mismatch');

  const dashboardPayload: Record<string, unknown> = payload('prix svp');
  delete dashboardPayload.companyId;
  delete dashboardPayload.contactId;
  delete dashboardPayload.instanceName;
  const dashboardReply = await service.generateReply(dashboardPayload, {
    sub: 'agent-alpha',
    email: 'agent@alpha.test',
    role: 'AGENT',
    companyId: 'company-alpha',
  });
  assert.equal(dashboardReply.canAnswer, true);
  assert.deepEqual(dashboardReply.sources, []);
  assert.match(dashboardReply.reply, /type de chambre/);
  assert.match(dashboardReply.reply, /date du sejour/);

  const priceRun = aiRuns.find((run) => run.intent === 'PRICE_QUERY');
  assert.ok(priceRun);
  assert.equal(priceRun.inputType, 'text');
  assert.equal(priceRun.normalizedMessage, 'Quels sont les tarifs ?');
  assert.equal(priceRun.detectedLanguage, 'fr');
  assert.equal(priceRun.needsRag, true);
  assert.equal(priceRun.canAnswer, true);
  assert.equal(priceRun.orderIntent, false);
  assert.deepEqual(priceRun.ragSources, ['kb-alpha']);
  assert.equal(typeof priceRun.response, 'string');
  assert.equal(priceRun.provider, 'gemini');
  assert.equal(priceRun.model, 'gemini-2.5-flash');
  assert.equal(priceRun.fallbackUsed, true);
  assert.equal(priceRun.errorMessage, 'openrouter: OPENROUTER_RATE_LIMIT');
  assert.equal(
    typeof (
      priceRun.rawResponse as {
        providerResponses: { understanding: { text: string } };
      }
    ).providerResponses.understanding.text,
    'string',
  );

  console.log('AI provider fallback and multi-company AI/RAG tests passed.');
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
