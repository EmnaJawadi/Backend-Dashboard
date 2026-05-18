import * as Joi from 'joi';

const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().default(3001),

  APP_URL: Joi.string().uri().optional().allow('', null),

  DATABASE_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  API_KEY: Joi.string().optional().allow('', null),

  EVOLUTION_API_URL: Joi.string().uri().optional().allow('', null),
  EVOLUTION_API_KEY: Joi.string().optional().allow('', null),
  EVOLUTION_INSTANCE: Joi.string().optional().allow('', null),
  WHATSAPP_DEFAULT_INSTANCE: Joi.string().optional().allow('', null),
  GEMINI_API_KEY: Joi.string().optional().allow('', null),
  GOOGLE_API_KEY: Joi.string().optional().allow('', null),
  GOOGLE_GENERATIVE_AI_API_KEY: Joi.string().optional().allow('', null),
  GEMINI_MODEL: Joi.string().optional().allow('', null),
  PRODUCT_IMAGE_MATCH_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.62),
  N8N_WEBHOOK_URL: Joi.string().uri().optional().allow('', null),
  N8N_WEBHOOK_SECRET: Joi.string().optional().allow('', null),
  N8N_WEBHOOK_TIMEOUT_MS: Joi.number().default(8000),

  JWT_RESET_PASSWORD_SECRET: Joi.string().optional().allow('', null),
  JWT_RESET_PASSWORD_EXPIRES_IN: Joi.string().default('30m'),
  RESET_PASSWORD_BASE_URL: Joi.string().uri().optional().allow('', null),

  SMTP_HOST: Joi.string().optional().allow('', null),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().optional().allow('', null),
  SMTP_PASS: Joi.string().optional().allow('', null),
  SMTP_FROM: Joi.string().optional().allow('', null),

  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow('', null),

  QUEUE_ATTEMPTS: Joi.number().default(3),
});

export default validationSchema;
