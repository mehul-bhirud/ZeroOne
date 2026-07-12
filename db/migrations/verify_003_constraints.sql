BEGIN;

SET LOCAL TIME ZONE 'UTC';

DO $$
DECLARE
  tag text;
  has_gin boolean;
  constraint_name text;
BEGIN
  SELECT indexname IS NOT NULL
    INTO has_gin
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'asset_categories'
     AND indexname = 'asset_categories_custom_fields_gin';
  IF NOT COALESCE(has_gin, false) THEN
    RAISE EXCEPTION 'asset category custom_fields GIN index is missing';
  END IF;

  INSERT INTO asset_categories (id, name, custom_fields)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Verification category', '{"vendor": "Acme"}'::jsonb);

  INSERT INTO users (id, name, email, password_hash)
  VALUES ('00000000-0000-0000-0000-000000000002', 'Verification Owner', 'Owner@Example.test', 'not-a-production-password');

  BEGIN
    INSERT INTO users (id, name, email, password_hash)
    VALUES ('00000000-0000-0000-0000-000000000003', 'Duplicate Owner', 'owner@example.TEST', 'not-a-production-password');
    RAISE EXCEPTION 'expected users_email_key violation was not raised';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'users_email_key' THEN
      RAISE EXCEPTION 'expected users_email_key, got %', constraint_name;
    END IF;
  END;

  INSERT INTO assets (id, name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable)
  VALUES ('00000000-0000-0000-0000-000000000004', 'Verification Laptop', '00000000-0000-0000-0000-000000000001', 'VERIFY-001', CURRENT_DATE, 1000, 'good', 'Lab', true)
  RETURNING asset_tag INTO tag;
  IF tag <> 'AF-0001' THEN
    RAISE EXCEPTION 'expected first sequence-generated tag AF-0001, got %', tag;
  END IF;

  INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date)
  VALUES ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'user', '00000000-0000-0000-0000-000000000002', CURRENT_DATE + 7);

  BEGIN
    INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date)
    VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 'user', '00000000-0000-0000-0000-000000000002', CURRENT_DATE + 14);
    RAISE EXCEPTION 'expected allocations_one_active_per_asset_idx violation was not raised';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'allocations_one_active_per_asset_idx' THEN
      RAISE EXCEPTION 'expected allocations_one_active_per_asset_idx, got %', constraint_name;
    END IF;
  END;

  UPDATE allocations
     SET returned_at = allocated_at + interval '1 day'
   WHERE id = '00000000-0000-0000-0000-000000000005';

  INSERT INTO allocations (id, asset_id, holder_type, holder_id, expected_return_date)
  VALUES ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 'user', '00000000-0000-0000-0000-000000000002', CURRENT_DATE + 14);

  INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time)
  VALUES
    ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '2030-01-01 09:00+00', '2030-01-01 10:00+00'),
    ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '2030-01-01 10:00+00', '2030-01-01 11:00+00');

  BEGIN
    INSERT INTO bookings (id, asset_id, booked_by, start_time, end_time)
    VALUES ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '2030-01-01 09:30+00', '2030-01-01 10:30+00');
    RAISE EXCEPTION 'expected bookings_no_active_overlap_excl violation was not raised';
  EXCEPTION WHEN exclusion_violation THEN
    GET STACKED DIAGNOSTICS constraint_name = CONSTRAINT_NAME;
    IF constraint_name <> 'bookings_no_active_overlap_excl' THEN
      RAISE EXCEPTION 'expected bookings_no_active_overlap_excl, got %', constraint_name;
    END IF;
  END;

  RAISE NOTICE '003 constraint verification passed: sequence, CITEXT, JSONB GIN, allocation uniqueness, and booking exclusion';
END $$;

ROLLBACK;
