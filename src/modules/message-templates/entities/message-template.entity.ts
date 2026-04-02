export class MessageTemplateEntity {
  id!: string;
  name!: string;
  category!: string;
  language!: string;
  content!: string;
  variables!: string[];
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<MessageTemplateEntity>) {
    Object.assign(this, partial);
  }
}