export class CompanyEntity {
  id!: string;
  name!: string;
<<<<<<< HEAD
  legalName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<CompanyEntity>) {
    Object.assign(this, partial);
  }
=======
  ownerId!: string;

  email!: string | null;
  phone!: string | null;
  address!: string | null;

  isActive!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
>>>>>>> d897e51f6cca8f930cf0fa31c51094035cee49d2
}