import assert from 'node:assert/strict';

const { WorkflowAiService } = require(
  '../dist/src/modules/ai/workflow-ai.service.js',
);
const { ChunkerService } = require(
  '../dist/src/modules/knowledge-base/ingestion/chunker.service.js',
);
const {
  INTELLIGENT_RAG_HISTORY_RULES,
  buildWorkflowGroundedReplyPrompt,
  buildWorkflowUnderstandingPrompt,
} = require('../dist/src/modules/ai/prompts/workflow.prompt.js');

function orderDetails(overrides: Record<string, unknown> = {}) {
  return {
    actionType: 'reservation',
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
    ...overrides,
  };
}

function decision(overrides: Record<string, unknown> = {}) {
  return {
    normalizedMessage: '',
    detectedLanguage: 'fr',
    intent: 'TOTAL_CALCULATION',
    needsRag: true,
    canAnswer: false,
    handoffRequired: false,
    orderIntent: true,
    orderDetails: orderDetails(),
    replyDraft: '',
    reply: '',
    keywordsForSearch: [],
    sources: [],
    confidence: 0.9,
    reason: null,
    ...overrides,
  };
}

function hotelRag() {
  return {
    hasReliableSources: true,
    confidence: 0.95,
    evidences: [
      {
        id: 'junior-p3',
        content:
          'Junior Suite P3 = 1200 TND par chambre par nuit, du 16/07/2026 au 31/08/2026.',
        score: 0.95,
      },
      {
        id: 'senior-p3',
        content:
          'Senior Suite P3 = 1680 TND par chambre par nuit, du 16/07/2026 au 31/08/2026.',
        score: 0.94,
      },
    ],
  };
}

function verifyPrompts() {
  assert.match(
    INTELLIGENT_RAG_HISTORY_RULES,
    /Règles intelligentes RAG, historique et conversation libre/,
  );
  for (const intent of [
    'SOCIAL_MESSAGE',
    'STAY_DETAILS_QUERY',
    'TOTAL_CALCULATION',
    'PHONE_CORRECTION',
    'CUSTOMER_CORRECTION',
    'CHOICE_CHANGE',
    'HUMAN_HANDOFF',
  ]) {
    assert.match(INTELLIGENT_RAG_HISTORY_RULES, new RegExp(intent));
  }

  const understanding = buildWorkflowUnderstandingPrompt({
    message: "Je souhaiterais connaitre les details de mon sejour a l'hotel.",
    companyName: 'Hotel Test',
    history: [],
    previousOrderDetails: null,
  });
  assert.match(understanding, /general request for stay details/i);
  assert.match(understanding, /Do not immediately request every calculation field/i);

  const grounded = buildWorkflowGroundedReplyPrompt({
    message: 'Est-ce que le petit dejeuner est inclus ?',
    companyName: 'Hotel Test',
    history: [{ role: 'assistant', content: 'Quelle est la date de depart ?' }],
    previousOrderDetails: orderDetails({ checkInDate: '16 juillet 2026' }),
    analysis: { intent: 'SERVICES_INCLUDED_QUERY' },
    evidence: '[source:breakfast] Petit dejeuner inclus.',
    allowedSources: ['breakfast'],
  });
  assert.match(grounded, /complete available history/i);
  assert.match(grounded, /Never ask again for a known unchanged value/i);
}

function verifyStateAndNights() {
  const service = Object.create(WorkflowAiService.prototype) as any;
  const first = orderDetails({
    checkInDate: '16 juillet 2026',
    numberOfAdults: 2,
    roomType: 'suite',
  });
  const second = orderDetails({
    checkOutDate: '29 juillet 2026',
    numberOfChildren: 0,
  });
  const merged = service.finalizeOrderDetails(service.mergeOrderDetails(first, second));
  assert.equal(merged.checkInDate, '16 juillet 2026');
  assert.equal(merged.checkOutDate, '29 juillet 2026');
  assert.equal(merged.numberOfAdults, 2);
  assert.equal(merged.numberOfChildren, 0);
  assert.equal(merged.roomType, 'suite');
  assert.equal(merged.nights, 13);
  assert.deepEqual(merged.missingFields, []);

  const missingWithoutRag = service.ensureHospitalityBookingGuidance(
    decision({
      intent: 'RESERVATION_REQUEST',
      orderDetails: orderDetails({ checkInDate: '16 juillet 2026' }),
    }),
    'Je veux reserver',
    null,
  );
  assert.equal(missingWithoutRag.handoffRequired, false);
  assert.match(missingWithoutRag.reply, /date de depart/);
  assert.doesNotMatch(missingWithoutRag.reply, /information exacte/i);
}

function pricedDecision(roomType: string) {
  return decision({
    orderDetails: orderDetails({
      checkInDate: '16 juillet 2026',
      checkOutDate: '29 juillet 2026',
      numberOfAdults: 2,
      numberOfChildren: 0,
      roomType,
      numberOfRooms: 1,
    }),
  });
}

function verifyHotelTotalsAndAmbiguity() {
  const service = Object.create(WorkflowAiService.prototype) as any;
  const ambiguous = service.applyGroundedHotelPricing(
    pricedDecision('suite'),
    'Donnez-moi le total exact du sejour',
    hotelRag(),
  );
  assert.match(ambiguous.reply, /Junior Suite/);
  assert.match(ambiguous.reply, /Senior Suite/);
  assert.match(ambiguous.reply.replace(/\s/g, ''), /15600TND/);
  assert.match(ambiguous.reply.replace(/\s/g, ''), /21840TND/);
  assert.deepEqual(ambiguous.orderDetails.missingFields, ['roomType']);

  const junior = service.applyGroundedHotelPricing(
    pricedDecision('Junior Suite'),
    'Calcule le total exact',
    hotelRag(),
  );
  assert.equal(junior.orderDetails.nights, 13);
  assert.equal(junior.orderDetails.total, 15600);
  assert.equal(junior.orderDetails.currency, 'TND');
  assert.deepEqual(junior.sources, ['junior-p3']);

  const senior = service.applyGroundedHotelPricing(
    pricedDecision('Senior Suite'),
    'Calcule le total exact',
    hotelRag(),
  );
  assert.equal(senior.orderDetails.total, 21840);
  assert.deepEqual(senior.sources, ['senior-p3']);
}

function verifyCorrectionsAndSocialMessages() {
  const service = Object.create(WorkflowAiService.prototype) as any;
  const previousPhone = orderDetails({
    actionType: 'order',
    phone: '20111222',
  });
  const phoneCorrection = service.applyBusinessAndOrderGuards(
    decision({
      intent: 'PHONE_CORRECTION',
      orderDetails: orderDetails({ actionType: 'order' }),
    }),
    'Non, ce numero de telephone est faux.',
    previousPhone,
  );
  assert.equal(phoneCorrection.orderDetails.phone, null);

  const previousRoom = orderDetails({
    roomType: 'Junior Suite',
    total: 15600,
    currency: 'TND',
  });
  const roomCorrection = service.applyBusinessAndOrderGuards(
    decision({ intent: 'CHOICE_CHANGE' }),
    'Non, plutot Senior Suite.',
    previousRoom,
  );
  assert.equal(roomCorrection.orderDetails.roomType, 'Senior Suite');
  assert.equal(roomCorrection.orderDetails.total, null);

  const social = service.applyBusinessAndOrderGuards(
    decision({ intent: 'SOCIAL_MESSAGE' }),
    "D'accord, nous vous rappellerons. Merci.",
    previousRoom,
  );
  assert.equal(social.needsRag, false);
  assert.equal(social.orderIntent, false);
  assert.equal(social.orderDetails.roomType, 'Junior Suite');
  assert.match(social.reply, /restons a votre disposition/i);
}

function verifySafetyAndTableChunks() {
  const service = Object.create(WorkflowAiService.prototype) as any;
  assert.equal(service.sanitizeReply('chunk id: abc'), '');
  assert.equal(service.sanitizeReply('Score RAG: 0.9'), '');
  assert.equal(service.sanitizeReply('Informations obligatoires avant un calcul'), '');
  assert.ok(service.evidenceSnippet('Phrase utile. '.repeat(200)).length < 500);

  const chunker = new ChunkerService();
  const chunks = chunker.chunkText(
    [
      '| Periode | Debut | Fin | Chambre | Prix | Devise | Unite |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| P3 | 16/07/2026 | 31/08/2026 | Junior Suite | 1200 | TND | par chambre par nuit |',
      '| P3 | 16/07/2026 | 31/08/2026 | Senior Suite | 1680 | TND | par chambre par nuit |',
    ].join('\n'),
    1000,
    100,
    'Hotel Test',
  );
  const rows = chunks.filter(
    (chunk: { metadata?: Record<string, unknown> }) =>
      chunk.metadata?.kind === 'structured_table_row',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].metadata.category, 'hotel_prices');
  assert.equal(rows[0].metadata.roomType, 'Junior Suite');
  assert.equal(rows[0].metadata.price, 1200);
  assert.match(rows[0].content, /Tarif hotel P3 - Junior Suite/);
}

verifyPrompts();
verifyStateAndNights();
verifyHotelTotalsAndAmbiguity();
verifyCorrectionsAndSocialMessages();
verifySafetyAndTableChunks();
console.log('Hotel conversation state, grounded totals and structured chunk tests passed.');
