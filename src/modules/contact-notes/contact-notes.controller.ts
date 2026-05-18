import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ContactNotesService } from './contact-notes.service';
import { CreateContactNoteDto } from './dto/create-contact-note.dto';
import { UpdateContactNoteDto } from './dto/update-contact-note.dto';

@Controller('contact-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class ContactNotesController {
  constructor(
    private readonly contactNotesService: ContactNotesService,
  ) {}

  @Post()
  create(
    @Body() createContactNoteDto: CreateContactNoteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactNotesService.create(createContactNoteDto, actor);
  }

  @Get()
  findAll(
    @Query('contactId') contactId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactNotesService.findAll(contactId, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.contactNotesService.findOne(id, actor);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateContactNoteDto: UpdateContactNoteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactNotesService.update(id, updateContactNoteDto, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.contactNotesService.remove(id, actor);
  }
}
