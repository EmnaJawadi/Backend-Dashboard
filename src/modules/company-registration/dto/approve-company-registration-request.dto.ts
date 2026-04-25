import { IsEnum, IsOptional } from 'class-validator';
import { CompanyStatus } from '../../../generated/prisma/client';

export class ApproveCompanyRegistrationRequestDto {
  @IsOptional()
  @IsEnum(CompanyStatus)
  companyStatus?: CompanyStatus;
}
