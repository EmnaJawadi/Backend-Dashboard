import { Injectable } from '@nestjs/common';
import { CompaniesRepository } from './companies.repository';
import { CreateCompanyDto } from './dto/create-company.dto';
import { InviteCompanyUserDto } from './dto/invite-company-user.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly companiesRepository: CompaniesRepository) {}

  create(createCompanyDto: CreateCompanyDto) {
    return this.companiesRepository.create({
      name: createCompanyDto.name,
      legalName: createCompanyDto.legalName ?? null,
      email: createCompanyDto.email ?? null,
      phoneNumber: createCompanyDto.phoneNumber ?? null,
      website: createCompanyDto.website ?? null,
      industry: createCompanyDto.industry ?? null,
      country: createCompanyDto.country ?? null,
      city: createCompanyDto.city ?? null,
      address: createCompanyDto.address ?? null,
      isActive: createCompanyDto.isActive ?? true,
    });
  }

  findAll(query: QueryCompaniesDto) {
    return this.companiesRepository.findAll(query);
  }

  findOne(id: string) {
    return this.companiesRepository.findById(id);
  }

  update(id: string, updateCompanyDto: UpdateCompanyDto) {
    return this.companiesRepository.update(id, {
      name: updateCompanyDto.name,
      legalName: updateCompanyDto.legalName,
      email: updateCompanyDto.email,
      phoneNumber: updateCompanyDto.phoneNumber,
      website: updateCompanyDto.website,
      industry: updateCompanyDto.industry,
      country: updateCompanyDto.country,
      city: updateCompanyDto.city,
      address: updateCompanyDto.address,
      isActive: updateCompanyDto.isActive,
    });
  }

  remove(id: string) {
    return this.companiesRepository.remove(id);
  }

  inviteUser(id: string, inviteCompanyUserDto: InviteCompanyUserDto) {
    const company = this.companiesRepository.findById(id);

    return {
      message: 'Company user invitation created successfully',
      data: {
        companyId: company.id,
        companyName: company.name,
        invitedUser: {
          firstName: inviteCompanyUserDto.firstName.trim(),
          lastName: inviteCompanyUserDto.lastName?.trim() ?? null,
          email: inviteCompanyUserDto.email.trim(),
          phoneNumber: inviteCompanyUserDto.phoneNumber?.trim() ?? null,
          role: inviteCompanyUserDto.role?.trim() ?? 'agent',
          invitedAt: new Date(),
        },
      },
    };
  }
}