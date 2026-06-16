import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ContactQueryDto } from './dto/contact-query.dto';
import { ContactEntity } from './entities/contact.entity';

type ContactWriteData = Partial<ContactEntity> & {
  companyId?: string | null;
};

function splitName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string | null;
} {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return {
      firstName: '',
      lastName: null,
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

function normalizeTags(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === 'string' ? item : String(item)))
    .filter((item) => item.trim().length > 0);
}

@Injectable()
export class ContactsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private requireCompanyId(
    companyId: string | null | undefined,
    action: string,
  ): string {
    const scopedCompanyId = companyId?.trim();

    if (!scopedCompanyId) {
      throw new BadRequestException(`companyId is required to ${action}`);
    }

    return scopedCompanyId;
  }

  private toEntity(data: {
    id: string;
    fullName: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    tags: Prisma.JsonValue | null;
    status: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ContactEntity {
    const names = splitName(data.fullName);

    return new ContactEntity({
      id: data.id,
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: data.fullName ?? names.firstName,
      phoneNumber: data.phone ?? '',
      email: data.email,
      avatarUrl: null,
      notes: data.notes,
      tags: normalizeTags(data.tags),
      isBlocked: data.status === 'blocked',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async create(data: ContactWriteData): Promise<ContactEntity> {
    const companyId = this.requireCompanyId(data.companyId, 'create a contact');

    const firstName = data.firstName?.trim() ?? '';
    const lastName = data.lastName?.trim() ?? null;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    let created;
    try {
      created = await this.prisma.contact.create({
        data: {
          companyId,
          phone: data.phoneNumber?.trim() ?? null,
          whatsappName: fullName || null,
          fullName: fullName || null,
          email: data.email ?? null,
          notes: data.notes ?? null,
          tags: data.tags ?? [],
          status: data.isBlocked ? 'blocked' : 'active',
          source: 'manual',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A contact with this phone number already exists');
      }
      throw error;
    }

    return this.toEntity(created);
  }

  async findAll(query: ContactQueryDto, companyId?: string) {
    const scopedCompanyId = this.requireCompanyId(
      companyId,
      'list contacts',
    );
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const andFilters: Prisma.ContactWhereInput[] = [];
    andFilters.push({ companyId: scopedCompanyId });

    if (query.search?.trim()) {
      const search = query.search.trim();
      andFilters.push({
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { whatsappName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (query.isBlocked !== undefined) {
      const isBlocked = query.isBlocked === 'true';
      andFilters.push(
        isBlocked
          ? { status: 'blocked' }
          : {
              OR: [{ status: { not: 'blocked' } }, { status: null }],
            },
      );
    }

    const where: Prisma.ContactWhereInput =
      andFilters.length > 0 ? { AND: andFilters } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      data: rows.map((item) => this.toEntity(item)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string, companyId?: string): Promise<ContactEntity> {
    const scopedCompanyId = this.requireCompanyId(
      companyId,
      'read a contact',
    );
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
        companyId: scopedCompanyId,
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact with id ${id} not found`);
    }

    return this.toEntity(contact);
  }

  async findByPhoneNumber(
    phoneNumber: string,
    companyId?: string | null,
  ): Promise<ContactEntity | null> {
    const scopedCompanyId = this.requireCompanyId(
      companyId,
      'search contacts',
    );
    const contact = await this.prisma.contact.findFirst({
      where: {
        phone: phoneNumber,
        companyId: scopedCompanyId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return contact ? this.toEntity(contact) : null;
  }

  async update(
    id: string,
    data: ContactWriteData,
    companyId?: string,
  ): Promise<ContactEntity> {
    const existing = await this.findById(id, companyId);
    const existingNames = splitName(existing.fullName);

    const firstName =
      data.firstName !== undefined ? data.firstName.trim() : existingNames.firstName;
    const lastName =
      data.lastName !== undefined ? data.lastName?.trim() ?? null : existingNames.lastName;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    let updated;
    try {
      updated = await this.prisma.contact.update({
        where: { id },
        data: {
          fullName: fullName || null,
          whatsappName: fullName || null,
          phone: data.phoneNumber !== undefined ? data.phoneNumber.trim() : existing.phoneNumber,
          email: data.email !== undefined ? data.email : existing.email,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          tags: data.tags !== undefined ? data.tags : existing.tags,
          status:
            data.isBlocked !== undefined
              ? data.isBlocked
                ? 'blocked'
                : 'active'
              : existing.isBlocked
              ? 'blocked'
              : 'active',
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A contact with this phone number already exists');
      }
      throw error;
    }

    return this.toEntity(updated);
  }

  async upsert(data: ContactWriteData): Promise<ContactEntity> {
    const phoneNumber = data.phoneNumber?.trim() ?? '';

    if (!phoneNumber) {
      return this.create(data);
    }

    const existing = await this.findByPhoneNumber(phoneNumber, data.companyId);

    if (existing) {
      return this.update(existing.id, data, data.companyId ?? undefined);
    }

    try {
      return await this.create(data);
    } catch (error) {
      if (!(error instanceof ConflictException)) throw error;
      const concurrent = await this.findByPhoneNumber(phoneNumber, data.companyId);
      if (!concurrent) throw error;
      return this.update(concurrent.id, data, data.companyId ?? undefined);
    }
  }

  async remove(id: string, companyId?: string): Promise<ContactEntity> {
    const scopedCompanyId = this.requireCompanyId(
      companyId,
      'remove a contact',
    );

    try {
      const deleted = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.contact.findFirst({
          where: {
            id,
            companyId: scopedCompanyId,
          },
        });

        if (!existing) {
          throw new NotFoundException(`Contact with id ${id} not found`);
        }

        await tx.contactNote.deleteMany({
          where: {
            contactId: id,
            companyId: scopedCompanyId,
          },
        });

        const conversations = await tx.conversation.findMany({
          where: {
            contactId: id,
            companyId: scopedCompanyId,
          },
          select: { id: true },
        });

        const conversationIds = conversations.map((item) => item.id);

        if (conversationIds.length > 0) {
          await tx.aiRun.deleteMany({
            where: {
              companyId: scopedCompanyId,
              conversationId: { in: conversationIds },
            },
          });

          await tx.message.deleteMany({
            where: {
              companyId: scopedCompanyId,
              conversationId: { in: conversationIds },
            },
          });

          await tx.conversationTag.deleteMany({
            where: {
              companyId: scopedCompanyId,
              conversationId: { in: conversationIds },
            },
          });

          await tx.conversation.deleteMany({
            where: {
              companyId: scopedCompanyId,
              id: { in: conversationIds },
            },
          });
        }

        return tx.contact.delete({ where: { id } });
      });

      return this.toEntity(deleted);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Impossible de supprimer ce contact car il est encore lie a des donnees dependantes.',
        );
      }

      throw error;
    }
  }
}
