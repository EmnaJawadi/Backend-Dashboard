export class UpdateWhatsappPolicyDto {
  sessionWindowHours?: number;
  allowTemplatesOutsideWindow?: boolean;
  defaultCountryCode?: string;
  verifyWebhookSignature?: boolean;
}