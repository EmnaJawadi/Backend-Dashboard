import { Injectable } from '@nestjs/common';
import { CreateMessageTemplateDto } from './dto/create-message-template.dto';
import { MessageTemplateQueryDto } from './dto/message-template-query.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';
import { MessageTemplatesRepository } from './message-templates.repository';

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly messageTemplatesRepository: MessageTemplatesRepository,
  ) {}

  create(createMessageTemplateDto: CreateMessageTemplateDto) {
    return this.messageTemplatesRepository.create({
      name: createMessageTemplateDto.name,
      category: createMessageTemplateDto.category,
      language: createMessageTemplateDto.language,
      content: createMessageTemplateDto.content,
      variables: createMessageTemplateDto.variables ?? [],
      isActive: createMessageTemplateDto.isActive ?? true,
    });
  }

  findAll(query: MessageTemplateQueryDto) {
    return this.messageTemplatesRepository.findAll(query);
  }

  findOne(id: string) {
    return this.messageTemplatesRepository.findById(id);
  }

  update(id: string, updateMessageTemplateDto: UpdateMessageTemplateDto) {
    return this.messageTemplatesRepository.update(id, {
      name: updateMessageTemplateDto.name,
      category: updateMessageTemplateDto.category,
      language: updateMessageTemplateDto.language,
      content: updateMessageTemplateDto.content,
      variables: updateMessageTemplateDto.variables,
      isActive: updateMessageTemplateDto.isActive,
    });
  }

  remove(id: string) {
    return this.messageTemplatesRepository.remove(id);
  }
}