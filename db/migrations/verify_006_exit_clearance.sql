BEGIN;

DO $$
DECLARE
  department_id uuid := 'f6000000-0000-0000-0000-000000000001';
  employee_both_id uuid := 'f6000000-0000-0000-0000-000000000002';
  employee_booking_id uuid := 'f6000000-0000-0000-0000-000000000003';
  employee_clear_id uuid := 'f6000000-0000-0000-0000-000000000004';
  category_id uuid := 'f6000000-0000-0000-0000-000000000005';
  asset_allocation_id uuid := 'f6000000-0000-0000-0000-000000000006';
  asset_booking_id uuid := 'f6000000-0000-0000-0000-000000000007';
  allocation_id uuid := 'f6000000-0000-0000-0000-000000000008';
  booking_both_id uuid := 'f6000000-0000-0000-0000-000000000009';
  booking_only_id uuid := 'f6000000-0000-0000-0000-000000000010';
  booking_completed_id uuid := 'f6000000-0000-0000-0000-000000000011';
  returned_state text;
  returned_message text;
  returned_detail text;
  returned_constraint text;
BEGIN
  INSERT INTO departments (id, name, status) VALUES (department_id, 'Exit Clearance Verify', 'active');
  INSERT INTO users (id, name, email, password_hash, role, department_id, status)
  VALUES
    (employee_both_id, 'Clearance Both', 'clearance-both@example.test', 'hash', 'employee', department_id, 'active'),
    (employee_booking_id, 'Clearance Booking', 'clearance-booking@example.test', 'hash', 'employee', department_id, 'active'),
    (employee_clear_id, 'Clearance Clear', 'clearance-clear@example.test', 'hash', 'employee', department_id, 'active');
  INSERT INTO asset_categories (id, name) VALUES (category_id, 'Exit Clearance Verify');
  INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, condition, location, status)
  VALUES
    (asset_allocation_id, 'Clearance Allocation Asset', category_id, 'CLEARANCE-ALLOC-1', CURRENT_DATE, 'good', 'HQ', 'allocated'),
    (asset_booking_id, 'Clearance Booking Asset', category_id, 'CLEARANCE-BOOK-1', CURRENT_DATE, 'good', 'HQ', 'available');
  INSERT INTO allocations (id, asset_id, holder_type, holder_id, allocated_at)
  VALUES (allocation_id, asset_allocation_id, 'user', employee_both_id, CURRENT_TIMESTAMP - interval '1 day');
  INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time, status)
  VALUES
    (booking_both_id, asset_booking_id, employee_both_id, CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP + interval '1 day 1 hour', 'upcoming'),
    (booking_only_id, asset_booking_id, employee_booking_id, CURRENT_TIMESTAMP + interval '2 days', CURRENT_TIMESTAMP + interval '2 days 1 hour', 'upcoming'),
    (booking_completed_id, asset_booking_id, employee_clear_id, CURRENT_TIMESTAMP - interval '2 days', CURRENT_TIMESTAMP - interval '1 day 23 hours', 'completed');

  BEGIN
    UPDATE users SET status = 'inactive' WHERE id = employee_both_id;
    RAISE EXCEPTION 'Expected active allocation and booking to block deactivation';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      returned_state = RETURNED_SQLSTATE,
      returned_message = MESSAGE_TEXT,
      returned_detail = PG_EXCEPTION_DETAIL,
      returned_constraint = CONSTRAINT_NAME;
    IF returned_state <> 'AF001'
       OR returned_message <> 'EXIT_CLEARANCE_REQUIRED'
       OR returned_constraint <> 'users_exit_clearance_required'
       OR (returned_detail::jsonb -> 'active_allocation_ids') IS NULL
       OR (returned_detail::jsonb -> 'upcoming_booking_ids') IS NULL THEN
      RAISE EXCEPTION 'Unexpected allocation+booking clearance signature: state=%, message=%, constraint=%, detail=%', returned_state, returned_message, returned_constraint, returned_detail;
    END IF;
  END;

  UPDATE allocations SET returned_at = CURRENT_TIMESTAMP WHERE id = allocation_id;
  UPDATE bookings SET status = 'cancelled' WHERE id = booking_both_id;
  UPDATE users SET status = 'inactive' WHERE id = employee_both_id;

  BEGIN
    UPDATE users SET status = 'inactive' WHERE id = employee_booking_id;
    RAISE EXCEPTION 'Expected upcoming booking to block deactivation';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      returned_state = RETURNED_SQLSTATE,
      returned_message = MESSAGE_TEXT,
      returned_detail = PG_EXCEPTION_DETAIL,
      returned_constraint = CONSTRAINT_NAME;
    IF returned_state <> 'AF001'
       OR returned_message <> 'EXIT_CLEARANCE_REQUIRED'
       OR returned_constraint <> 'users_exit_clearance_required'
       OR jsonb_array_length((returned_detail::jsonb -> 'active_allocation_ids')) <> 0
       OR jsonb_array_length((returned_detail::jsonb -> 'upcoming_booking_ids')) <> 1 THEN
      RAISE EXCEPTION 'Unexpected booking-only clearance signature: state=%, message=%, constraint=%, detail=%', returned_state, returned_message, returned_constraint, returned_detail;
    END IF;
  END;

  UPDATE bookings SET status = 'cancelled' WHERE id = booking_only_id;
  UPDATE users SET status = 'inactive' WHERE id = employee_booking_id;
  UPDATE users SET status = 'inactive' WHERE id = employee_clear_id;

  IF (SELECT count(*) FROM users WHERE id IN (employee_both_id, employee_booking_id, employee_clear_id) AND status = 'inactive') <> 3 THEN
    RAISE EXCEPTION 'Exit clearance verifier expected all resolved users to be inactive';
  END IF;
END;
$$;

ROLLBACK;
