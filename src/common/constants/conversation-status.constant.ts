export const CONVERSATION_STATUS = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type ConversationStatus =
  (typeof CONVERSATION_STATUS)[keyof typeof CONVERSATION_STATUS];

export const CONVERSATION_STATUS_VALUES: ConversationStatus[] = Object.values(
  CONVERSATION_STATUS,
);