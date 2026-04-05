import { registerAs } from '@nestjs/config';

export default registerAs('whatsapp', () => ({
  evolutionApiUrl: process.env.EVOLUTION_API_URL,
  evolutionApiKey: process.env.EVOLUTION_API_KEY,
  defaultInstance: process.env.WHATSAPP_DEFAULT_INSTANCE || '',
}));