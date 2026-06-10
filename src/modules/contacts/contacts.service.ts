import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { UpsertContactDto } from './dto/upsert-contact.dto';
import { ContactsRepository } from './contacts.repository';
import { N8nService } from '../../integrations/n8n/n8n.service';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private readonly contactsRepository: ContactsRepository,
    private readonly n8nService: N8nService,
    private readonly prisma: PrismaService,
  ) {}

  private async resolveRequiredCompanyId(
    actor: AuthenticatedUser | undefined,
    requestedCompanyId?: string | null,
    action = 'contacts',
  ): Promise<string> {
    const actorCompanyId = resolveCompanyScope(actor);
    const requested = requestedCompanyId?.trim() || null;

    if (actorCompanyId) {
      if (requested && requested !== actorCompanyId) {
        throw new BadRequestException(
          'companyId is resolved from the authenticated user',
        );
      }

      return actorCompanyId;
    }

    if (!requested) {
      throw new BadRequestException(
        'companyId is required for strict multi-company contact operations',
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: requested },
      select: { id: true, name: true, isActive: true, status: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found for contact operation');
    }

    this.logger.log(
      `CONTACT_COMPANY_SCOPE action=${action} companyId=${company.id} companyName=${company.name} status=${company.status} isActive=${company.isActive}`,
    );

    return company.id;
  }

  async create(createContactDto: CreateContactDto, actor?: AuthenticatedUser) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      createContactDto.companyId,
      'create_contact',
    );

    return this.contactsRepository.create({
      companyId,
      firstName: createContactDto.firstName,
      lastName: createContactDto.lastName ?? null,
      phoneNumber: createContactDto.phoneNumber,
      email: createContactDto.email ?? null,
      avatarUrl: createContactDto.avatarUrl ?? null,
      notes: createContactDto.notes ?? null,
      tags: createContactDto.tags ?? [],
      isBlocked: false,
    });
  }

  async findAll(query: ContactQueryDto, actor?: AuthenticatedUser) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      query.companyId,
      'list_contacts',
    );

    return this.contactsRepository.findAll(query, companyId);
  }

  async findOne(
    id: string,
    actor?: AuthenticatedUser,
    companyIdParam?: string | null,
  ) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      companyIdParam,
      'get_contact',
    );

    return this.contactsRepository.findById(id, companyId);
  }

  async update(
    id: string,
    updateContactDto: UpdateContactDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      updateContactDto.companyId,
      'update_contact',
    );

    return this.contactsRepository.update(id, {
      firstName: updateContactDto.firstName,
      lastName: updateContactDto.lastName,
      phoneNumber: updateContactDto.phoneNumber,
      email: updateContactDto.email,
      avatarUrl: updateContactDto.avatarUrl,
      notes: updateContactDto.notes,
      tags: updateContactDto.tags,
      isBlocked: updateContactDto.isBlocked,
    }, companyId);
  }

  async upsert(upsertContactDto: UpsertContactDto, actor?: AuthenticatedUser) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      upsertContactDto.companyId,
      'upsert_contact',
    );

    return this.contactsRepository.upsert({
      companyId,
      firstName: upsertContactDto.firstName,
      lastName: upsertContactDto.lastName ?? null,
      phoneNumber: upsertContactDto.phoneNumber,
      email: upsertContactDto.email ?? null,
      avatarUrl: upsertContactDto.avatarUrl ?? null,
      notes: upsertContactDto.notes ?? null,
      tags: upsertContactDto.tags ?? [],
    });
  }

  async remove(
    id: string,
    actor?: AuthenticatedUser,
    companyIdParam?: string | null,
  ) {
    const companyId = await this.resolveRequiredCompanyId(
      actor,
      companyIdParam,
      'delete_contact',
    );
    const deleted = await this.contactsRepository.remove(
      id,
      companyId,
    );
    await this.n8nService.notifyContactDeleted(deleted);
    return deleted;
  }
}
