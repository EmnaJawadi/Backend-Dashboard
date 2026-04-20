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
    parameters?: string[];
    variables?: Record<string, string>;
    conversationId?: string;
  }) {
    const parameters = data.parameters ?? [];

    return {
      to: data.phoneNumber,
      type: 'template',
      template: {
        name: data.templateName,
        language: data.language ?? 'fr',
        parameters,
        variables: data.variables ?? {},
        components:
          parameters.length > 0
            ? [
                {
                  type: 'body',
                  parameters: parameters.map((value) => ({
                    type: 'text',
                    text: value,
                  })),
                },
              ]
            : [],
      },
      metadata: {
        conversationId: data.conversationId ?? null,
      },
    };
  }
}
