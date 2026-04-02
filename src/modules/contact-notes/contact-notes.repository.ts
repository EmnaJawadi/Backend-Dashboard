import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ContactNoteEntity } from './entities/contact-note.entity';

@Injectable()
export class ContactNotesRepository {
  private readonly notes: ContactNoteEntity[] = [];

  create(data: Partial<ContactNoteEntity>): ContactNoteEntity {
    const now = new Date();

    const note = new ContactNoteEntity({
      id: randomUUID(),
      contactId: data.contactId ?? '',
      content: data.content?.trim() ?? '',
      authorId: data.authorId ?? null,
      authorName: data.authorName ?? null,
      isPinned: data.isPinned ?? false,
      createdAt: now,
      updatedAt: now,
    });

    this.notes.push(note);
    return note;
  }

  findAll(contactId?: string): ContactNoteEntity[] {
    const data = contactId
      ? this.notes.filter((note) => note.contactId === contactId)
      : [...this.notes];

    return data.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  findById(id: string): ContactNoteEntity {
    const note = this.notes.find((item) => item.id === id);

    if (!note) {
      throw new NotFoundException(`Contact note with id ${id} not found`);
    }

    return note;
  }

  update(id: string, data: Partial<ContactNoteEntity>): ContactNoteEntity {
    const note = this.findById(id);

    if (data.content !== undefined) {
      note.content = data.content.trim();
    }

    if (data.authorId !== undefined) {
      note.authorId = data.authorId;
    }

    if (data.authorName !== undefined) {
      note.authorName = data.authorName;
    }

    if (data.isPinned !== undefined) {
      note.isPinned = data.isPinned;
    }

    note.updatedAt = new Date();

    return note;
  }

  remove(id: string): ContactNoteEntity {
    const index = this.notes.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Contact note with id ${id} not found`);
    }

    const deleted = this.notes[index];
    this.notes.splice(index, 1);

    return deleted;
  }
}