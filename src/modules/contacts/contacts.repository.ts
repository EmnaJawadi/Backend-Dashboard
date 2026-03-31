import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ContactEntity } from './entities/contact.entity';
import { ContactMapper } from './mappers/contact.mapper';

@Injectable()
export class ContactsRepository {
  private readonly contacts: ContactEntity[] = [];

  create(data: Partial<ContactEntity>): ContactEntity {
    const now = new Date();
    const firstName = data.firstName?.trim() ?? '';
    const lastName = data.lastName?.trim() ?? null;

    const contact = ContactMapper.toEntity({
      id: randomUUID(),
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(' '),
      phoneNumber: data.phoneNumber?.trim() ?? '',
      email: data.email ?? null,
      avatarUrl: data.avatarUrl ?? null,
      notes: data.notes ?? null,
      tags: data.tags ?? [],
      isBlocked: data.isBlocked ?? false,
      createdAt: now,
      updatedAt: now,
    });

    this.contacts.push(contact);
    return contact;
  }

  findAll(query: ContactQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    let data = [...this.contacts];

    if (query.search) {
      const search = query.search.toLowerCase();
      data = data.filter(
        (contact) =>
          contact.firstName.toLowerCase().includes(search) ||
          contact.lastName?.toLowerCase().includes(search) ||
          contact.fullName.toLowerCase().includes(search) ||
          contact.phoneNumber.toLowerCase().includes(search) ||
          contact.email?.toLowerCase().includes(search),
      );
    }

    if (query.isBlocked !== undefined) {
      const isBlocked = query.isBlocked === 'true';
      data = data.filter((contact) => contact.isBlocked === isBlocked);
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

  findById(id: string): ContactEntity {
    const contact = this.contacts.find((item) => item.id === id);

    if (!contact) {
      throw new NotFoundException(`Contact with id ${id} not found`);
    }

    return contact;
  }

  findByPhoneNumber(phoneNumber: string): ContactEntity | null {
    return (
      this.contacts.find((item) => item.phoneNumber === phoneNumber) ?? null
    );
  }

  update(id: string, data: Partial<ContactEntity>): ContactEntity {
    const contact = this.findById(id);

    if (data.firstName !== undefined) {
      contact.firstName = data.firstName.trim();
    }

    if (data.lastName !== undefined) {
      contact.lastName = data.lastName?.trim() ?? null;
    }

    if (data.phoneNumber !== undefined) {
      contact.phoneNumber = data.phoneNumber.trim();
    }

    if (data.email !== undefined) {
      contact.email = data.email;
    }

    if (data.avatarUrl !== undefined) {
      contact.avatarUrl = data.avatarUrl;
    }

    if (data.notes !== undefined) {
      contact.notes = data.notes;
    }

    if (data.tags !== undefined) {
      contact.tags = data.tags;
    }

    if (data.isBlocked !== undefined) {
      contact.isBlocked = data.isBlocked;
    }

    contact.fullName = [contact.firstName, contact.lastName]
      .filter(Boolean)
      .join(' ');
    contact.updatedAt = new Date();

    return contact;
  }

  upsert(data: Partial<ContactEntity>): ContactEntity {
    const existing = this.findByPhoneNumber(data.phoneNumber ?? '');

    if (existing) {
      return this.update(existing.id, data);
    }

    return this.create(data);
  }

  remove(id: string): ContactEntity {
    const index = this.contacts.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Contact with id ${id} not found`);
    }

    const deleted = this.contacts[index];
    this.contacts.splice(index, 1);

    return deleted;
  }
}