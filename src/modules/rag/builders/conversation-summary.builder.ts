export class ConversationSummaryBuilder {
  build(messages: Array<string | { role?: string; content?: string }>): string {
    if (!messages?.length) return '';

    return messages
      .slice(-10)
      .map((message, i) => {
        if (typeof message === 'string') {
          return `${i + 1}. ${message}`;
        }

        const role = message.role ? `${message.role}: ` : '';
        return `${i + 1}. ${role}${message.content ?? ''}`;
      })
      .join('\n');
  }
}
