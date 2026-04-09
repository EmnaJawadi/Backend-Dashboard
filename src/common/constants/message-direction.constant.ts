export const MESSAGE_DIRECTION = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;

export type MessageDirection =
  (typeof MESSAGE_DIRECTION)[keyof typeof MESSAGE_DIRECTION];

export const MESSAGE_DIRECTION_VALUES: MessageDirection[] = Object.values(
  MESSAGE_DIRECTION,
);