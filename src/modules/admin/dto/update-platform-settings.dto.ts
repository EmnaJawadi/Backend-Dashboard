export class UpdatePlatformSettingsDto {
  platformName?: string;
  supportEmail?: string | null;
  defaultLanguage?: string;
  defaultCurrency?: string;
  maintenanceMode?: boolean;
  allowNewCompanyRegistration?: boolean;
  allowUserInvitations?: boolean;
}