import { Injectable } from '@nestjs/common';
import { CreateContactNoteDto } from './dto/create-contact-note.dto';
import { UpdateContactNoteDto } from './dto/update-contact-note.dto';
import { ContactNotesRepository } from './contact-notes.repository';

@Injectable()
export class ContactNotesService {
  constructor(
    private readonly contactNotesRepository: ContactNotesRepository,
  ) {}

  create(createContactNoteDto: CreateContactNoteDto) {
    return this.contactNotesRepository.create({
      contactId: createContactNoteDto.contactId,
      content: createContactNoteDto.content,
      authorId: createContactNoteDto.authorId ?? null,
      authorName: createContactNoteDto.authorName ?? null,
      isPinned: createContactNoteDto.isPinned ?? false,
    });
  }

  findAll(contactId?: string) {
    return this.contactNotesRepository.findAll(contactId);
  }

  findOne(id: string) {
    return this.contactNotesRepository.findById(id);
  }

  update(id: string, updateContactNoteDto: UpdateContactNoteDto) {
    return this.contactNotesRepository.update(id, {
      content: updateContactNoteDto.content,
      authorId: updateContactNoteDto.authorId,
      authorName: updateContactNoteDto.authorName,
      isPinned: updateContactNoteDto.isPinned,
    });
  }

  remove(id: string) {
    return this.contactNotesRepository.remove(id);
  }
}