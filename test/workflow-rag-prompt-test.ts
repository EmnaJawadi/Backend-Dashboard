import assert from 'node:assert/strict';

const {
  RAG_AND_KNOWLEDGE_BASE_RULES,
  INTELLIGENT_RAG_HISTORY_RULES,
  WORKFLOW_SYSTEM_PROMPT,
  buildWorkflowGroundedReplyPrompt,
  buildWorkflowUnderstandingPrompt,
} = require('../dist/src/modules/ai/prompts/workflow.prompt.js');
const { WorkflowAiService } = require(
  '../dist/src/modules/ai/workflow-ai.service.js',
);

function verifyPromptContract() {
  assert.match(
    WORKFLOW_SYSTEM_PROMPT,
    /Règles RAG et base de connaissance/,
  );
  assert.ok(WORKFLOW_SYSTEM_PROMPT.includes(RAG_AND_KNOWLEDGE_BASE_RULES));
  assert.ok(WORKFLOW_SYSTEM_PROMPT.includes(INTELLIGENT_RAG_HISTORY_RULES));
  assert.match(
    INTELLIGENT_RAG_HISTORY_RULES,
    /Règles intelligentes RAG, historique et conversation libre/,
  );

  const requiredRules = [
    /exact requested fact/i,
    /current scoped company/i,
    /correct row/i,
    /Never copy an entire article/i,
    /Calculate a total only when every operand/i,
    /Il me manque le prix de \[élément\]/i,
    /When the customer asks only for confirmation/i,
    /ask one short question/i,
    /same requested or dominant language/i,
    /Never expose chunks/i,
    /Pure social message: answer directly without RAG/i,
    /Produce no chain-of-thought/i,
  ];
  for (const rule of requiredRules) assert.match(RAG_AND_KNOWLEDGE_BASE_RULES, rule);

  assert.match(WORKFLOW_SYSTEM_PROMPT, /Keep replies warm, short, clear/i);
  assert.match(WORKFLOW_SYSTEM_PROMPT, /Confirm an order only after/i);

  const context = {
    message: 'Quel est le prix du pack Premium ?',
    companyName: 'Example Company',
    history: [],
    previousOrderDetails: null,
  };
  const understanding = buildWorkflowUnderstandingPrompt(context);
  const grounded = buildWorkflowGroundedReplyPrompt({
    ...context,
    analysis: { intent: 'PRICE_QUERY', needsRag: true },
    evidence: '[source:chunk-1]\nPack Premium | 65 TND | livraison incluse',
    allowedSources: ['chunk-1'],
  });

  assert.match(understanding, /SOCIAL MESSAGES/);
  assert.match(understanding, /OTHER BUSINESS QUERIES/);
  assert.match(grounded, /Private evidence from this company only/);
  assert.match(grounded, /Never expose internal IDs/);
  assert.match(grounded, /Allowed source ids:\s*chunk-1/);
}

function verifyDeterministicSafetyGuards() {
  const service = Object.create(WorkflowAiService.prototype) as any;

  assert.equal(
    service.verificationReply('fr'),
    "Je n'ai pas cette information exacte pour le moment. Je peux transmettre votre demande à un responsable.",
  );
  assert.equal(service.sanitizeReply('chunk id: abc123'), '');
  assert.equal(service.sanitizeReply('Score RAG: 0.91'), '');
  assert.equal(service.sanitizeReply('Le Pack Premium coûte 65 TND.'), 'Le Pack Premium coûte 65 TND.');

  const complete = service.finalizeOrderDetails({
    ...service.emptyOrderDetails(),
    actionType: 'order',
    customerName: 'Client',
    phone: '20000000',
    address: 'Tunis',
    items: [
      {
        name: 'Pack A',
        quantity: 1,
        unitPrice: 40,
        currency: 'TND',
        subtotal: null,
        availability: 'available',
      },
      {
        name: 'Pack B',
        quantity: 1,
        unitPrice: 25,
        currency: 'TND',
        subtotal: null,
        availability: 'available',
      },
    ],
  });
  assert.equal(complete.total, 65);

  const incomplete = service.finalizeOrderDetails({
    ...complete,
    total: null,
    items: complete.items.map((item: Record<string, unknown>, index: number) =>
      index === 1 ? { ...item, unitPrice: null, subtotal: null } : item,
    ),
  });
  assert.equal(incomplete.total, null);

  const mixedCurrencies = service.finalizeOrderDetails({
    ...complete,
    total: 65,
    items: complete.items.map((item: Record<string, unknown>, index: number) =>
      index === 1 ? { ...item, currency: 'EUR' } : item,
    ),
  });
  assert.equal(mixedCurrencies.total, null);
  assert.equal(mixedCurrencies.currency, null);
}

verifyPromptContract();
verifyDeterministicSafetyGuards();
console.log('Workflow RAG system prompt and deterministic safety guards passed.');
