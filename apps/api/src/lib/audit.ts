import type { Pool } from 'pg';

export interface AuditParams {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export async function writeAudit(pool: Pool, params: AuditParams): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.actorId,
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.before ? JSON.stringify(params.before) : null,
      params.after ? JSON.stringify(params.after) : null,
    ]
  );
}
