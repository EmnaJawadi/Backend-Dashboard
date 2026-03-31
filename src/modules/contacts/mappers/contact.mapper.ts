import { ContactEntity } from '../entities/contact.entity';

export class ContactMapper {
  static toEntity(data: Partial<ContactEntity>): ContactEntity {
    return new ContactEntity(data);
  }
}