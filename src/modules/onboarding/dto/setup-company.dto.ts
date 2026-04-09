import { CompanyInfoDto } from './company-info.dto';
import { CreateTeamMemberDto } from './create-team-member.dto';

export class SetupCompanyDto {
  company!: CompanyInfoDto;
  teamMembers?: CreateTeamMemberDto[];
}