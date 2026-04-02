import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ContactNotesService } from './contact-notes.service';
import { CreateContactNoteDto } from './dto/create-contact-note.dto';
import { UpdateContactNoteDto } from './dto/update-contact-note.dto';

@Controller('contact-notes')
export class ContactNotesController {
  constructor(
    private readonly contactNotesService: ContactNotesService,
  ) {}

  @Post()
  create(@Body() createContactNoteDto: CreateContactNoteDto) {
    return this.contactNotesService.create(createContactNoteDto);
  }

  @Get()
  findAll(@Query('contactId') contactId?: string) {
    return this.contactNotesService.findAll(contactId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contactNotesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateContactNoteDto: UpdateContactNoteDto,
  ) {
    return this.contactNotesService.update(id, updateContactNoteDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contactNotesService.remove(id);
  }
}