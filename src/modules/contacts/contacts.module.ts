import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { N8nModule } from '../../integrations/n8n/n8n.module';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsService } from './contacts.service';

@Module({
  imports: [PrismaModule, N8nModule],
  controllers: [ContactsController],
  providers: [ContactsService, ContactsRepository],
  exports: [ContactsService, ContactsRepository],
})
export class ContactsModule {}
