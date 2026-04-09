export class UpdateCompanyDto {
  name?: string;
  legalName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  isActive?: boolean;
}