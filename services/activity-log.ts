import { DatabaseClient } from "./db";

export async function logActivity(
  db: DatabaseClient,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: object = {}
): Promise<void> {
  await db.query(`
    INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
  `, [actorId, action, entityType, entityId, JSON.stringify(metadata)]);
}
