import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateContactNoteDto } from './dto/create-contact-note.dto';
import { UpdateContactNoteDto } from './dto/update-contact-note.dto';
import { ContactNotesRepository } from './contact-notes.repository';

@Injectable()
export class ContactNotesService {
  constructor(
    private readonly contactNotesRepository: ContactNotesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(
    createContactNoteDto: CreateContactNoteDto,
    actor?: AuthenticatedUser,
  ) {
    const companyId = resolveCompanyScope(actor);
    const contact = await this.prisma.contact.findFirst({
      where: {
        id: createContactNoteDto.contactId,
        ...(companyId ? { companyId } : {}),
      },
      select: { companyId: true },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    return this.contactNotesRepository.create({
      companyId: contact.companyId ?? companyId ?? null,
      contactId: createContactNoteDto.contactId,
      content: createContactNoteDto.content,
      authorId: createContactNoteDto.authorId ?? actor?.sub ?? '',
      authorName: createContactNoteDto.authorName ?? null,
      isPinned: createContactNoteDto.isPinned ?? false,
    });
  }

  findAll(contactId?: string, actor?: AuthenticatedUser) {
    return this.contactNotesRepository.findAll(
      contactId,
      resolveCompanyScope(actor),
    );
  }

  findOne(id: string, actor?: AuthenticatedUser) {
    return this.contactNotesRepository.findById(id, resolveCompanyScope(actor));
  }

  update(
    id: string,
    updateContactNoteDto: UpdateContactNoteDto,
    actor?: AuthenticatedUser,
  ) {
    return this.contactNotesRepository.update(id, {
      content: updateContactNoteDto.content,
      authorId: updateContactNoteDto.authorId,
      authorName: updateContactNoteDto.authorName,
      isPinned: updateContactNoteDto.isPinned,
    }, resolveCompanyScope(actor));
  }

  remove(id: string, actor?: AuthenticatedUser) {
    return this.contactNotesRepository.remove(id, resolveCompanyScope(actor));
  }
}
