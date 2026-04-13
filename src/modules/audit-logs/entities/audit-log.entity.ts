export class AuditLogEntity {
  id!: string;
  action!: string | null;
  entityType!: string | null;
  entityId!: string | null;
  actorUserId!: string | null;
  details!: unknown;
  ipAddress!: string | null;
  createdAt!: Date;

  constructor(partial?: Partial<AuditLogEntity>) {
    Object.assign(this, partial);
  }
}