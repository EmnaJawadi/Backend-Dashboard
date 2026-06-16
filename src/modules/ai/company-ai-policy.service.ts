import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';

export type CompanyBusinessDomain = 'generic' | 'hospitality';

@Injectable()
export class CompanyAiPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveBusinessDomain(
    companyId: string,
    reliableEvidence: string[] = [],
  ): Promise<CompanyBusinessDomain> {
    const [setting, registration] = await Promise.all([
      this.prisma.setting.findFirst({
        where: { companyId, key: `company_settings_v2:${companyId}` },
        select: { value: true },
      }),
      this.prisma.companyRegistrationRequest.findFirst({
        where: { approvedCompanyId: companyId },
        orderBy: { approvedAt: 'desc' },
        select: { businessType: true },
      }),
    ]);
    const value = this.asRecord(setting?.value);
    const aiPolicy = this.asRecord(value.aiPolicy);
    const configured = this.normalize(
      typeof aiPolicy.businessDomain === 'string'
        ? aiPolicy.businessDomain
        : typeof aiPolicy.domain === 'string'
          ? aiPolicy.domain
          : '',
    );

    if (configured) {
      return this.isHospitality(configured) ? 'hospitality' : 'generic';
    }

    const businessType = this.normalize(registration?.businessType ?? '');
    if (this.isHospitality(businessType)) {
      return 'hospitality';
    }

    const evidence = this.normalize(reliableEvidence.join(' '));
    return this.isHospitality(evidence) ? 'hospitality' : 'generic';
  }

  private isHospitality(value: string): boolean {
    return /\b(hotel|hotellerie|hospitality|resort|hebergement|accommodation)\b/.test(
      value,
    );
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
