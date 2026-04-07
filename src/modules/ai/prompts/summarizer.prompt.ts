export function buildSummarizerPrompt(history: Array<{ role: string; content: string }>): string {
  const formatted = history.map((item) => `${item.role.toUpperCase()}: ${item.content}`).join('\n');

  return `
Summarize this support conversation in 2 or 3 short sentences.

Conversation:
${formatted || 'No conversation history'}

Return only the summary text.
`.trim();
}