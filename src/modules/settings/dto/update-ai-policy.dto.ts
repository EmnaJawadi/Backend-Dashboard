export class UpdateAiPolicyDto {
  enabled?: boolean;
  autoReply?: boolean;
  confidenceThreshold?: number;
  handoffThreshold?: number;
  maxRetries?: number;
}