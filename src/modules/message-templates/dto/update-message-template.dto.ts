export class UpdateMessageTemplateDto {
  name?: string;
  category?: string;
  language?: string;
  content?: string;
  variables?: string[];
  isActive?: boolean;
}