type BuildEscalationPromptParams = {
  message: string;
  draftReply?: string;
};

export function buildEscalationPrompt(params: BuildEscalationPromptParams): string {
  return `
Analyze this support case and decide if it should be escalated to a human supervisor.

Customer message:
${params.message}

Draft reply:
${params.draftReply ?? 'No draft available'}

Return JSON only in this format:
{
  "shouldEscalate": true,
  "reason": "short reason",
  "confidence": 0.85
}
`.trim();
}