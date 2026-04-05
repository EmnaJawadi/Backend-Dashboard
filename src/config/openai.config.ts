import { registerAs } from '@nestjs/config';

export default registerAs('openai', () => ({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  embeddingModel:
    process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
}));