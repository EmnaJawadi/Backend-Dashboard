import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CompanyInfoDto } from './dto/company-info.dto';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { SetupCompanyDto } from './dto/setup-company.dto';

type OnboardingTeamMember = {
  id: string;
  firstName: string;
  lastName?: string | null;
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type OnboardingState = {
  company: CompanyInfoDto;
  teamMembers: OnboardingTeamMember[];
  completedAt: Date;
};

@Injectable()
export class OnboardingService {
  private onboardingState: OnboardingState | null = null;

  setupCompany(setupCompanyDto: SetupCompanyDto) {
    const company: CompanyInfoDto = {
      companyName: setupCompanyDto.company.companyName.trim(),
      legalName: setupCompanyDto.company.legalName?.trim() ?? null,
      industry: setupCompanyDto.company.industry?.trim() ?? null,
      website: setupCompanyDto.company.website?.trim() ?? null,
      email: setupCompanyDto.company.email?.trim() ?? null,
      phoneNumber: setupCompanyDto.company.phoneNumber?.trim() ?? null,
      country: setupCompanyDto.company.country?.trim() ?? null,
      city: setupCompanyDto.company.city?.trim() ?? null,
      address: setupCompanyDto.company.address?.trim() ?? null,
      companySize: setupCompanyDto.company.companySize?.trim() ?? null,
    };

    const now = new Date();

    const teamMembers: OnboardingTeamMember[] = (setupCompanyDto.teamMembers ?? []).map(
      (member) => {
        const firstName = member.firstName.trim();
        const lastName = member.lastName?.trim() ?? null;

        return {
          id: randomUUID(),
          firstName,
          lastName,
          fullName: [firstName, lastName].filter(Boolean).join(' '),
          email: member.email.trim(),
          phoneNumber: member.phoneNumber?.trim() ?? null,
          role: member.role?.trim() ?? 'agent',
          isActive: member.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        };
      },
    );

    this.onboardingState = {
      company,
      teamMembers,
      completedAt: now,
    };

    return {
      message: 'Company onboarding completed successfully',
      data: this.onboardingState,
    };
  }

  getCompanyInfo() {
    if (!this.onboardingState) {
      throw new NotFoundException('Company onboarding data not found');
    }

    return this.onboardingState.company;
  }

  getTeamMembers() {
    if (!this.onboardingState) {
      throw new NotFoundException('Company onboarding data not found');
    }

    return this.onboardingState.teamMembers;
  }

  addTeamMember(createTeamMemberDto: CreateTeamMemberDto) {
    if (!this.onboardingState) {
      throw new NotFoundException(
        'Company onboarding must be completed before adding team members',
      );
    }

    const firstName = createTeamMemberDto.firstName.trim();
    const lastName = createTeamMemberDto.lastName?.trim() ?? null;
    const now = new Date();

    const member: OnboardingTeamMember = {
      id: randomUUID(),
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      email: createTeamMemberDto.email.trim(),
      phoneNumber: createTeamMemberDto.phoneNumber?.trim() ?? null,
      role: createTeamMemberDto.role?.trim() ?? 'agent',
      isActive: createTeamMemberDto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.onboardingState.teamMembers.push(member);

    return member;
  }

  getStatus() {
    return {
      completed: Boolean(this.onboardingState),
      company: this.onboardingState?.company ?? null,
      teamMembersCount: this.onboardingState?.teamMembers.length ?? 0,
      completedAt: this.onboardingState?.completedAt ?? null,
    };
  }
}