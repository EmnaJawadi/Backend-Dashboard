import { Module } from '@nestjs/common';
import { MessageTemplatesController } from './message-templates.controller';
import { MessageTemplatesRepository } from './message-templates.repository';
import { MessageTemplatesService } from './message-templates.service';

@Module({
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService, MessageTemplatesRepository],
  exports: [MessageTemplatesService, MessageTemplatesRepository],
})
export class MessageTemplatesModule {}