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