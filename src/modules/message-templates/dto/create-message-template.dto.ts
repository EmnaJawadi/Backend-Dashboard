export class CreateMessageTemplateDto {
  name!: string;
  category!: string;
  language!: string;
  content!: string;
  variables?: string[];
  isActive?: boolean;
}