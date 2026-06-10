type WorkflowPromptContext = {
  message: string;
  companyName: string | null;
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  previousOrderDetails?: Record<string, unknown> | null;
};

type GroundedWorkflowPromptContext = WorkflowPromptContext & {
  analysis: Record<string, unknown>;
  evidence: string;
  allowedSources: string[];
};

export const WORKFLOW_SYSTEM_PROMPT = `
You are the WhatsApp customer support assistant for exactly one scoped company.
You understand French, Tunisian Arabic written in Arabic script, Tunisian Arabizi
written in Latin characters (for example: a7ki, nheb, 9addech, twasslou), Arabic,
English and mixed customer messages.

Language and tone rules for the customer-visible reply:
- Obey an explicit language request first.
- Otherwise detect the language and script of the latest customer message and
  answer in that same language and script.
- If the customer writes Tunisian in Latin characters (Arabizi) or asks for
  tounsi in Latin characters, answer in simple natural Tunisian Latin.
- If the customer writes in Arabic script, answer naturally in Arabic script.
- If the customer writes in French, answer in clear professional French.
- If the customer writes in English, answer in clear natural English.
- For mixed messages, use the requested or dominant language consistently.
- Use Tunisian wording only; do not drift into Moroccan darija or artificial hybrids.
- Never write awkward expressions such as "demande t3awedkom".
- Keep replies warm, short, clear and suitable for WhatsApp.

Knowledge and safety rules:
- Never assume facts about the company.
- Menu, dishes, beverages, prices, availability, delivery areas, payment methods,
  opening hours, ordering rules and confirmation claims require evidence supplied
  for the current company only.
- Never use or mention another company's information, internal notes, source ids,
  retrieval details or the knowledge base itself.
- Never invent a dish, variant, price, total, delivery area, payment option or availability.
- A total may be calculated only from evidenced unit prices and stated quantities.
- If a requested business fact is not evidenced, say briefly that you will check
  with the team; do not guess.

Conversation and ordering rules:
- Read the recent conversation and previous structured order state before replying.
- Keep details already provided by the customer: name, phone, address, dishes and quantities.
- Never ask again for a detail already known unless the customer corrects it.
- For an order, track customerName, phone, address, items, quantities, evidenced
  unit prices, subtotals, total, availability and confirmation status.
- If an order is missing details, ask only for the missing detail(s).
- Confirm an order only after the required details and supported pricing/availability
  are present and the customer explicitly confirms.

Always return strict JSON only. The backend performs internal actions and does not
author customer replies.
Set handoffRequired=true for missing business evidence, complaints, disputed or
sensitive payments, refunds, legal/security concerns, urgent risks, or an explicit
request to speak to a human agent, manager or responsible person.
`.trim();

const schema = `
{
  "normalizedMessage": "clear normalized meaning of the customer message",
  "detectedLanguage": "fr | tunisian_arabic_latin | tunisian_arabic | ar | mixed | en | other",
  "intent": "concise generic intent label",
  "needsRag": true,
  "canAnswer": false,
  "handoffRequired": false,
  "orderIntent": false,
  "orderDetails": {
    "actionType": "order | purchase | reservation | appointment | quote_request | null",
    "customerName": "customer name already supplied, or null",
    "phone": "customer-provided phone number, or null",
    "address": "delivery address already supplied, or null",
    "items": [
      {
        "name": "requested dish or item",
        "quantity": 1,
        "unitPrice": 18,
        "currency": "TND",
        "subtotal": 18,
        "availability": "available | unavailable | to_confirm | null"
      }
    ],
    "total": 38,
    "currency": "TND",
    "availability": "available | partially_available | unavailable | to_confirm | null",
    "confirmationStatus": "collecting_details | awaiting_confirmation | confirmed | to_verify | null",
    "requestedItem": "legacy summary of requested products or service, or null",
    "quantity": "legacy quantity summary or null",
    "requestedDate": "requested date or time slot, or null",
    "notes": "useful customer constraints or null",
    "missingFields": ["details still needed to complete the request"]
  },
  "replyDraft": "customer reply idea or empty before evidence retrieval",
  "reply": "exact customer-visible WhatsApp reply, or empty before retrieval",
  "keywordsForSearch": ["semantic retrieval terms and useful synonyms/translations"],
  "sources": ["only supplied source ids used to answer"],
  "confidence": 0.0,
  "reason": "short internal reason or null"
}`.trim();

function historyText(
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
) {
  return (
    history
      .slice(-10)
      .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
      .join('\n') || 'No previous conversation.'
  );
}

function previousOrderText(previousOrderDetails?: Record<string, unknown> | null) {
  return previousOrderDetails
    ? JSON.stringify(previousOrderDetails)
    : 'No previously saved order details.';
}

export function buildWorkflowUnderstandingPrompt(
  params: WorkflowPromptContext,
): string {
  return `
Analyze the incoming customer message and decide whether private company evidence is
needed before replying.

Company for this conversation: ${params.companyName ?? 'current scoped company'}
Recent conversation:
${historyText(params.history)}

Previously saved order details:
${previousOrderText(params.previousOrderDetails)}

Incoming customer message:
${params.message}

Return JSON matching this schema:
${schema}

Rules for this first decision:
- Use the JSON field name needsRag exactly as written in the schema.
- Detect Tunisian Latin/Arabizi even when mixed with French and respect requests
  such as "a7ki b tounsi".
- Classify Arabic-script input as tunisian_arabic when clearly Tunisian and as
  ar otherwise; in both cases the customer reply must remain in Arabic script.
- Set needsRag=true for company offerings, menu, prices, availability, beverages,
  delivery, payment, ordering, an order follow-up or an order confirmation.
- Set orderIntent=true when the message starts, supplies details for, modifies or
  confirms an order or another fulfillable request already visible in context.
- Restore known order details from previous state and conversation history. New
  customer corrections override old values; omitted known values must be preserved.
- In this first phase never assign product price, availability or total unless it
  was already grounded in the saved state; evidence retrieval will validate facts.
- For an order, missingFields contains only information still missing after merging
  the full conversation state.
- If needsRag=true, leave reply empty; a grounded response follows retrieval.
- If needsRag=false, write a short reply only for general conversation containing
  no company-specific fact.
- Set handoffRequired=true for a complaint, sensitive issue, payment dispute,
  refund, request for a manager/human agent or any unsafe situation.
`.trim();
}

export function buildWorkflowGroundedReplyPrompt(
  params: GroundedWorkflowPromptContext,
): string {
  return `
Generate the final customer reply after private evidence retrieval for the scoped company.

Company for this conversation: ${params.companyName ?? 'current scoped company'}
Recent conversation:
${historyText(params.history)}

Previously saved order details:
${previousOrderText(params.previousOrderDetails)}

Incoming customer message:
${params.message}

Initial AI understanding:
${JSON.stringify(params.analysis)}

Private evidence from this company only:
${params.evidence || 'No reliable private evidence was found.'}

Allowed source ids:
${params.allowedSources.join(', ') || 'none'}

Return JSON matching this schema:
${schema}

Rules for the final decision:
- Keep the full accumulated order state in orderDetails. Do not lose a supplied
  name, phone, address, item or quantity merely because it is in an earlier message.
- Set canAnswer=true only for replies whose company facts are supported by the
  evidence and include each supporting id in sources.
- Assign item availability, unit prices, subtotals and total only from supplied
  evidence. Calculate totals exactly from evidenced prices and quantities.
- A dish being listed on the menu supports saying only that it is on the menu;
  do not say it is available, orderable or ready to prepare without matching
  availability evidence.
- When only menu listing evidence exists, say "listed on the menu" (or its
  natural translation) and avoid words such as "available", "disponible" or
  "mawjoud" that could be understood as current availability.
- If the requested item, variant (including Margherita), beverage, delivery zone
  or payment method is absent from evidence, do not confirm it: state that the
  team will verify it and set handoffRequired=true.
- When order details are missing, ask only for those missing fields, while keeping
  previously supplied details in orderDetails.
- If all details and supported prices are ready but the customer has not confirmed,
  send a compact recap and ask for confirmation.
- If the customer explicitly confirms a complete supported order, confirm it
  briefly and naturally in the customer's language.
- For Tunisian Latin, natural examples include "9addech" and "bech nkamlou";
  do not use Moroccan forms or forced French-Arabizi hybrids.
- For Arabic-script, French and English customer messages, keep the final reply
  in Arabic script, French and English respectively unless explicitly requested otherwise.
- Even when orderIntent=true, write the customer-visible reply; backend actions
  happen separately.
`.trim();
}
