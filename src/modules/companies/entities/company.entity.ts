export class CompanyEntity {
  id!: string;
  name!: string;
  ownerId!: string;

  email!: string | null;
  phone!: string | null;
  address!: string | null;

  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}