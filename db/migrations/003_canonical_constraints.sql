BEGIN;

ALTER SEQUENCE asset_tag_seq OWNED BY assets.asset_tag;

ALTER TABLE assets
  ADD CONSTRAINT assets_acquisition_cost_nonnegative_ck
  CHECK (acquisition_cost >= 0);

ALTER TABLE allocations
  ADD CONSTRAINT allocations_returned_after_allocated_ck
  CHECK (returned_at IS NULL OR returned_at >= allocated_at);

ALTER TABLE bookings
  RENAME CONSTRAINT bookings_check TO bookings_valid_time_range_ck;

ALTER TABLE audit_cycles
  RENAME CONSTRAINT audit_cycles_check TO audit_cycles_valid_date_range_ck;

CREATE UNIQUE INDEX allocations_one_active_per_asset_idx
  ON allocations (asset_id)
  WHERE returned_at IS NULL;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_active_overlap_excl
  EXCLUDE USING gist (
    asset_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status IN ('upcoming', 'ongoing'));

COMMIT;
