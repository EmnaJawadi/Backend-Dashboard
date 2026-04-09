export const CONVERSATION_PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type ConversationPriority =
  (typeof CONVERSATION_PRIORITY)[keyof typeof CONVERSATION_PRIORITY];

export const CONVERSATION_PRIORITY_VALUES: ConversationPriority[] = Object.values(
  CONVERSATION_PRIORITY,
);