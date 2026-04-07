export class ConversationSummaryBuilder {
  build(messages: string[]): string {
    if (!messages?.length) return '';

    return messages
      .slice(-10)
      .map((m, i) => `${i + 1}. ${m}`)
      .join('\n');
  }
}