import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ContactNoteEntity } from './entities/contact-note.entity';

@Injectable()
export class ContactNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toEntity(row: {
    id: string;
    companyId: string | null;
    contactId: string;
    authorId: string;
    note: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return new ContactNoteEntity({
      id: row.id,
      companyId: row.companyId,
      contactId: row.contactId,
      content: row.note,
      authorId: row.authorId,
      authorName: null,
      isPinned: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async create(data: Partial<ContactNoteEntity>): Promise<ContactNoteEntity> {
    const now = new Date();

    const note = await this.prisma.contactNote.create({
      data: {
        companyId: data.companyId ?? null,
        contactId: data.contactId ?? '',
        authorId: data.authorId ?? '',
        note: data.content?.trim() ?? '',
        createdAt: now,
        updatedAt: now,
      },
    });

    return this.toEntity(note);
  }

  async findAll(
    contactId?: string,
    companyId?: string,
  ): Promise<ContactNoteEntity[]> {
    const data = await this.prisma.contactNote.findMany({
      where: {
        ...(contactId ? { contactId } : {}),
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return data.map((item) => this.toEntity(item));
  }

  async findById(
    id: string,
    companyId?: string,
  ): Promise<ContactNoteEntity> {
    const note = await this.prisma.contactNote.findFirst({
      where: {
        id,
        ...(companyId ? { companyId } : {}),
      },
    });

    if (!note) {
      throw new NotFoundException(`Contact note with id ${id} not found`);
    }

    return this.toEntity(note);
  }

  async update(
    id: string,
    data: Partial<ContactNoteEntity>,
    companyId?: string,
  ): Promise<ContactNoteEntity> {
    await this.findById(id, companyId);

    const note = await this.prisma.contactNote.update({
      where: { id },
      data: {
        note: data.content !== undefined ? data.content.trim() : undefined,
        authorId: data.authorId !== undefined ? data.authorId ?? '' : undefined,
        updatedAt: new Date(),
      },
    });

    return this.toEntity(note);
  }

  async remove(id: string, companyId?: string): Promise<ContactNoteEntity> {
    await this.findById(id, companyId);
    const deleted = await this.prisma.contactNote.delete({ where: { id } });

    return this.toEntity(deleted);
  }
}
