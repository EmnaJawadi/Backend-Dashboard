export class WhatsappMapper {
  static mapMessagePayload(data: {
    phoneNumber: string;
    message: string;
    conversationId?: string;
  }) {
    return {
      to: data.phoneNumber,
      type: 'text',
      text: {
        body: data.message,
      },
      metadata: {
        conversationId: data.conversationId ?? null,
      },
    };
  }

  static mapTemplatePayload(data: {
    phoneNumber: string;
    templateName: string;
    language?: string;
    variables?: Record<string, string>;
    conversationId?: string;
  }) {
    return {
      to: data.phoneNumber,
      type: 'template',
      template: {
        name: data.templateName,
        language: data.language ?? 'fr',
        variables: data.variables ?? {},
      },
      metadata: {
        conversationId: data.conversationId ?? null,
      },
    };
  }
}