export class AuditLogEntity {
  id!: string;
  action!: string;
  entityType!: string | null;
  entityId!: string | null;
  userId!: string | null;
  metadata!: Record<string, unknown> | null;
  createdAt!: Date;

  constructor(partial: Partial<AuditLogEntity>) {
    Object.assign(this, partial);
  }
}