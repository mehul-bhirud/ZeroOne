BEGIN;

CREATE OR REPLACE FUNCTION reject_activity_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ActivityLog is append-only; existing entries cannot be changed or deleted.'
    USING ERRCODE = '55000',
          HINT = 'Create a new ActivityLog entry for a correction.';
END;
$$;

DROP TRIGGER IF EXISTS activity_log_append_only ON activity_log;
CREATE TRIGGER activity_log_append_only
BEFORE UPDATE OR DELETE ON activity_log
FOR EACH ROW
EXECUTE FUNCTION reject_activity_log_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON activity_log FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assetflow_app') THEN
    CREATE ROLE assetflow_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO assetflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO assetflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO assetflow_app;
REVOKE UPDATE, DELETE, TRUNCATE ON activity_log FROM assetflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO assetflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO assetflow_app;

COMMIT;
