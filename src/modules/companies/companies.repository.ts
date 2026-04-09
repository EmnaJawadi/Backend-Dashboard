import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { QueryCompaniesDto } from './dto/query-companies.dto';
import { CompanyEntity } from './entities/company.entity';

@Injectable()
export class CompaniesRepository {
  private readonly companies: CompanyEntity[] = [];

  create(data: Partial<CompanyEntity>): CompanyEntity {
    const now = new Date();

    const company = new CompanyEntity({
      id: randomUUID(),
      name: data.name?.trim() ?? '',
      legalName: data.legalName?.trim() ?? null,
      email: data.email?.trim() ?? null,
      phoneNumber: data.phoneNumber?.trim() ?? null,
      website: data.website?.trim() ?? null,
      industry: data.industry?.trim() ?? null,
      country: data.country?.trim() ?? null,
      city: data.city?.trim() ?? null,
      address: data.address?.trim() ?? null,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    this.companies.push(company);

    return company;
  }

  findAll(query: QueryCompaniesDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    let data = [...this.companies];

    if (query.search) {
      const search = query.search.toLowerCase();

      data = data.filter(
        (company) =>
          company.name.toLowerCase().includes(search) ||
          company.legalName?.toLowerCase().includes(search) ||
          company.email?.toLowerCase().includes(search) ||
          company.phoneNumber?.toLowerCase().includes(search) ||
          company.website?.toLowerCase().includes(search) ||
          company.industry?.toLowerCase().includes(search) ||
          company.country?.toLowerCase().includes(search) ||
          company.city?.toLowerCase().includes(search) ||
          company.address?.toLowerCase().includes(search),
      );
    }

    if (query.industry) {
      data = data.filter((company) => company.industry === query.industry);
    }

    if (query.country) {
      data = data.filter((company) => company.country === query.country);
    }

    if (query.isActive !== undefined) {
      const isActive = query.isActive === 'true';
      data = data.filter((company) => company.isActive === isActive);
    }

    const total = data.length;
    const start = (page - 1) * limit;
    const paginated = data.slice(start, start + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  findById(id: string): CompanyEntity {
    const company = this.companies.find((item) => item.id === id);

    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    return company;
  }

  update(id: string, data: Partial<CompanyEntity>): CompanyEntity {
    const company = this.findById(id);

    if (data.name !== undefined) {
      company.name = data.name.trim();
    }

    if (data.legalName !== undefined) {
      company.legalName = data.legalName?.trim() ?? null;
    }

    if (data.email !== undefined) {
      company.email = data.email?.trim() ?? null;
    }

    if (data.phoneNumber !== undefined) {
      company.phoneNumber = data.phoneNumber?.trim() ?? null;
    }

    if (data.website !== undefined) {
      company.website = data.website?.trim() ?? null;
    }

    if (data.industry !== undefined) {
      company.industry = data.industry?.trim() ?? null;
    }

    if (data.country !== undefined) {
      company.country = data.country?.trim() ?? null;
    }

    if (data.city !== undefined) {
      company.city = data.city?.trim() ?? null;
    }

    if (data.address !== undefined) {
      company.address = data.address?.trim() ?? null;
    }

    if (data.isActive !== undefined) {
      company.isActive = data.isActive;
    }

    company.updatedAt = new Date();

    return company;
  }

  remove(id: string): CompanyEntity {
    const index = this.companies.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }

    const deleted = this.companies[index];
    this.companies.splice(index, 1);

    return deleted;
  }
}