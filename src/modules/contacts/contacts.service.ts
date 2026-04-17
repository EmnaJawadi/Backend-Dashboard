import { Injectable } from '@nestjs/common';
import { ContactQueryDto } from './dto/contact-query.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { UpsertContactDto } from './dto/upsert-contact.dto';
import { ContactsRepository } from './contacts.repository';
import { N8nService } from '../../integrations/n8n/n8n.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly contactsRepository: ContactsRepository,
    private readonly n8nService: N8nService,
  ) {}

  create(createContactDto: CreateContactDto) {
    return this.contactsRepository.create({
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

  findAll(query: ContactQueryDto) {
    return this.contactsRepository.findAll(query);
  }

  findOne(id: string) {
    return this.contactsRepository.findById(id);
  }

  update(id: string, updateContactDto: UpdateContactDto) {
    return this.contactsRepository.update(id, {
      firstName: updateContactDto.firstName,
      lastName: updateContactDto.lastName,
      phoneNumber: updateContactDto.phoneNumber,
      email: updateContactDto.email,
      avatarUrl: updateContactDto.avatarUrl,
      notes: updateContactDto.notes,
      tags: updateContactDto.tags,
      isBlocked: updateContactDto.isBlocked,
    });
  }

  upsert(upsertContactDto: UpsertContactDto) {
    return this.contactsRepository.upsert({
      firstName: upsertContactDto.firstName,
      lastName: upsertContactDto.lastName ?? null,
      phoneNumber: upsertContactDto.phoneNumber,
      email: upsertContactDto.email ?? null,
      avatarUrl: upsertContactDto.avatarUrl ?? null,
      notes: upsertContactDto.notes ?? null,
      tags: upsertContactDto.tags ?? [],
    });
  }

  async remove(id: string) {
    const deleted = await this.contactsRepository.remove(id);
    await this.n8nService.notifyContactDeleted(deleted);
    return deleted;
  }
}
