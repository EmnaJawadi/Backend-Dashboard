import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ContactQueryDto } from './dto/contact-query.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { UpsertContactDto } from './dto/upsert-contact.dto';
import { ContactsService } from './contacts.service';

@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  create(
    @Body() createContactDto: CreateContactDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactsService.create(createContactDto, actor);
  }

  @Get()
  findAll(
    @Query() query: ContactQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactsService.findAll(query, actor);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactsService.findOne(id, actor, companyId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateContactDto: UpdateContactDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactsService.update(id, updateContactDto, actor);
  }

  @Put('upsert')
  upsert(
    @Body() upsertContactDto: UpsertContactDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactsService.upsert(upsertContactDto, actor);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contactsService.remove(id, actor, companyId);
  }
}
