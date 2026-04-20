type BuildReplyPromptParams = {
  message: string;
  contactName?: string;
  channel?: string;
  history?: Array<{ role: string; content: string }>;
};

export function buildReplyPrompt(params: BuildReplyPromptParams): string {
  const historyBlock = (params.history ?? [])
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join('\n');

  return `
Generate a support reply for the incoming customer message.

Customer name: ${params.contactName ?? 'Unknown'}
Channel: ${params.channel ?? 'whatsapp'}

Conversation history:
${historyBlock || 'No history available.'}

Incoming customer message:
${params.message}

Return only the final reply text.
`.trim();
}

type BuildStructuredReplyPromptParams = BuildReplyPromptParams & {
  evidenceContext: string;
  allowedSourceIds: string[];
  needsClarification: boolean;
  sensitive: boolean;
};

export function buildStructuredReplyPrompt(
  params: BuildStructuredReplyPromptParams,
): string {
  const historyBlock = (params.history ?? [])
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join('\n');

  return `
You are the AI agent of a WhatsApp customer support backend.
Use only the knowledge-base evidence below. Do not invent facts.

Customer name: ${params.contactName ?? 'Unknown'}
Channel: ${params.channel ?? 'whatsapp'}

Conversation history:
${historyBlock || 'No history available.'}

Knowledge-base evidence:
${params.evidenceContext || 'No reliable evidence found.'}

Allowed source ids:
${params.allowedSourceIds.join(', ') || 'none'}

Incoming customer message:
${params.message}

Signals:
- needsClarification: ${params.needsClarification}
- sensitiveOrRisky: ${params.sensitive}

Return strict JSON only. No markdown. No extra text.
Schema:
{
  "intent": "pricing | refund | technical_support | order_status | complaint | greeting | other",
  "answer": "short helpful answer in the customer's language",
  "confidence": 0.0,
  "handoffRequired": false,
  "needsClarification": false,
  "sources": ["only ids from allowed source ids"],
  "tagsToApply": ["short lowercase tags"],
  "reason": "short machine-readable reason or null"
}

Rules:
- If evidence is missing or insufficient, answer that the information is not available in the knowledge base and set handoffRequired=true.
- If the message is incomplete, ask one concise clarification question and set needsClarification=true.
- If the case is legal, billing-critical, angry, privacy-related, credentials-related, fraud-related, or risky, set handoffRequired=true.
- Use sources only when the answer is directly supported by the evidence.
`.trim();
}
