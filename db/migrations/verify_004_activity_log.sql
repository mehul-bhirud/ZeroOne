BEGIN;

DO $$
DECLARE
  actor uuid;
  entity uuid;
BEGIN
  SELECT id INTO actor FROM users ORDER BY id LIMIT 1;
  SELECT id INTO entity FROM assets ORDER BY id LIMIT 1;
  IF actor IS NULL OR entity IS NULL THEN
    RAISE EXCEPTION 'Seed data is required before running the ActivityLog verifier';
  END IF;

  SET LOCAL ROLE assetflow_app;
  INSERT INTO activity_log (id, actor_id, action, entity_type, entity_id, metadata)
  VALUES ('ffffffff-ffff-ffff-ffff-fffffffffff1', actor, 'verifier.inserted', 'Asset', entity, '{"occurred_at":"2026-01-01T00:00:00Z"}'::jsonb);

  BEGIN
    UPDATE activity_log SET action = 'verifier.updated' WHERE id = 'ffffffff-ffff-ffff-ffff-fffffffffff1';
    RAISE EXCEPTION 'assetflow_app unexpectedly updated ActivityLog';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM activity_log WHERE id = 'ffffffff-ffff-ffff-ffff-fffffffffff1';
    RAISE EXCEPTION 'assetflow_app unexpectedly deleted ActivityLog';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RESET ROLE;
  BEGIN
    UPDATE activity_log SET action = 'verifier.owner_updated' WHERE id = 'ffffffff-ffff-ffff-ffff-fffffffffff1';
    RAISE EXCEPTION 'owner unexpectedly updated ActivityLog';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    NULL;
  END;
END $$;

ROLLBACK;
