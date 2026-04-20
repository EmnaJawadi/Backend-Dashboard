export type GeminiGenerateTextInput = {
  prompt: string;
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type GeminiGenerateTextOutput = {
  text: string;
  model: string;
  usage?: GeminiUsage;
};

export type GeminiChatMessageRole = 'user' | 'assistant';

export type GeminiChatMessage = {
  role: GeminiChatMessageRole;
  content: string;
};

export type GeminiChatInput = {
  messages: GeminiChatMessage[];
  systemInstruction?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type GeminiChatOutput = {
  text: string;
  model: string;
  usage?: GeminiUsage;
};

export type GeminiUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};
