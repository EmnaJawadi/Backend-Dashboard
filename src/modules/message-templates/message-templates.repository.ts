import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MessageTemplateQueryDto } from './dto/message-template-query.dto';
import { MessageTemplateEntity } from './entities/message-template.entity';

@Injectable()
export class MessageTemplatesRepository {
  private readonly templates: MessageTemplateEntity[] = [];

  create(data: Partial<MessageTemplateEntity>): MessageTemplateEntity {
    const now = new Date();

    const template = new MessageTemplateEntity({
      id: randomUUID(),
      name: data.name?.trim() ?? '',
      category: data.category?.trim() ?? '',
      language: data.language?.trim() ?? 'fr',
      content: data.content?.trim() ?? '',
      variables: data.variables ?? [],
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });

    this.templates.push(template);
    return template;
  }

  findAll(query: MessageTemplateQueryDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    let data = [...this.templates];

    if (query.search) {
      const search = query.search.toLowerCase();
      data = data.filter(
        (template) =>
          template.name.toLowerCase().includes(search) ||
          template.category.toLowerCase().includes(search) ||
          template.language.toLowerCase().includes(search) ||
          template.content.toLowerCase().includes(search),
      );
    }

    if (query.category) {
      data = data.filter((template) => template.category === query.category);
    }

    if (query.language) {
      data = data.filter((template) => template.language === query.language);
    }

    if (query.isActive !== undefined) {
      const isActive = query.isActive === 'true';
      data = data.filter((template) => template.isActive === isActive);
    }

    const total = data.length;
    const start = (page - 1) * limit;
    const paginated = data.slice(start, start + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  findById(id: string): MessageTemplateEntity {
    const template = this.templates.find((item) => item.id === id);

    if (!template) {
      throw new NotFoundException(`Message template with id ${id} not found`);
    }

    return template;
  }

  update(id: string, data: Partial<MessageTemplateEntity>): MessageTemplateEntity {
    const template = this.findById(id);

    if (data.name !== undefined) {
      template.name = data.name.trim();
    }

    if (data.category !== undefined) {
      template.category = data.category.trim();
    }

    if (data.language !== undefined) {
      template.language = data.language.trim();
    }

    if (data.content !== undefined) {
      template.content = data.content.trim();
    }

    if (data.variables !== undefined) {
      template.variables = data.variables;
    }

    if (data.isActive !== undefined) {
      template.isActive = data.isActive;
    }

    template.updatedAt = new Date();

    return template;
  }

  remove(id: string): MessageTemplateEntity {
    const index = this.templates.findIndex((item) => item.id === id);

    if (index === -1) {
      throw new NotFoundException(`Message template with id ${id} not found`);
    }

    const deleted = this.templates[index];
    this.templates.splice(index, 1);

    return deleted;
  }
}