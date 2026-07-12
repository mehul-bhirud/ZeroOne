BEGIN;

CREATE OR REPLACE FUNCTION enforce_user_exit_clearance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allocation_ids jsonb;
  booking_ids jsonb;
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'inactive' THEN
    SELECT COALESCE(jsonb_agg(a.id ORDER BY a.allocated_at), '[]'::jsonb)
      INTO allocation_ids
      FROM allocations a
     WHERE a.holder_type = 'user'
       AND a.holder_id = OLD.id
       AND a.returned_at IS NULL;

    SELECT COALESCE(jsonb_agg(b.id ORDER BY b.start_time), '[]'::jsonb)
      INTO booking_ids
      FROM bookings b
     WHERE b.booked_by = OLD.id
       AND b.status = 'upcoming'
       AND b.end_time > CURRENT_TIMESTAMP;

    IF jsonb_array_length(allocation_ids) > 0 OR jsonb_array_length(booking_ids) > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'AF001',
        MESSAGE = 'EXIT_CLEARANCE_REQUIRED',
        DETAIL = jsonb_build_object(
          'employee_id', OLD.id,
          'active_allocation_ids', allocation_ids,
          'upcoming_booking_ids', booking_ids
        )::text,
        CONSTRAINT = 'users_exit_clearance_required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_exit_clearance_guard_trg ON users;
CREATE TRIGGER users_exit_clearance_guard_trg
BEFORE UPDATE OF status ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_user_exit_clearance();

COMMIT;
