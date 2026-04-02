import { Module } from '@nestjs/common';
import { ContactNotesController } from './contact-notes.controller';
import { ContactNotesRepository } from './contact-notes.repository';
import { ContactNotesService } from './contact-notes.service';

@Module({
  controllers: [ContactNotesController],
  providers: [ContactNotesService, ContactNotesRepository],
  exports: [ContactNotesService, ContactNotesRepository],
})
export class ContactNotesModule {}