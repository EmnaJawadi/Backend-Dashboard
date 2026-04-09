export const QUEUE_NAMES = {
  WEBHOOKS: 'webhooks',
  MESSAGES: 'messages',
  AI: 'ai',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit-logs',
  KNOWLEDGE_BASE: 'knowledge-base',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const QUEUE_NAME_VALUES: QueueName[] = Object.values(QUEUE_NAMES);