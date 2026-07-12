BEGIN;

-- Assets that have not been verified in the configured 90-day window.
CREATE VIEW v_ghost_risk AS
SELECT
  a.id AS asset_id,
  a.asset_tag,
  a.name AS asset_name,
  a.category_id,
  c.name AS category_name,
  a.serial_number,
  a.status,
  a.location,
  a.acquisition_cost,
  a.last_verified_at,
  CASE
    WHEN a.last_verified_at IS NULL THEN NULL
    ELSE EXTRACT(day FROM (now() - a.last_verified_at))::integer
  END AS days_since_verified,
  current_holder.department_id
FROM assets a
JOIN asset_categories c ON c.id = a.category_id
LEFT JOIN LATERAL (
  SELECT u.department_id
  FROM allocations al
  JOIN users u ON u.id = al.holder_id
  WHERE al.asset_id = a.id
    AND al.holder_type = 'user'
    AND al.returned_at IS NULL
  ORDER BY al.allocated_at DESC
  LIMIT 1
) current_holder ON true
WHERE a.status NOT IN ('retired', 'disposed')
  AND (a.last_verified_at IS NULL OR a.last_verified_at <= now() - interval '90 days');

-- One row per asset with booking volume and occupied minutes.
CREATE VIEW v_utilization AS
SELECT
  a.id AS asset_id,
  a.asset_tag,
  a.name AS asset_name,
  a.category_id,
  a.location,
  a.status,
  a.is_bookable,
  current_holder.department_id,
  COUNT(b.id) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show'))::integer AS booking_count,
  COALESCE(SUM(EXTRACT(epoch FROM (b.end_time - b.start_time)) / 60)
    FILTER (WHERE b.status NOT IN ('cancelled', 'no_show')), 0)::bigint AS booked_minutes,
  MIN(b.start_time) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show')) AS first_booking_at,
  MAX(b.end_time) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show')) AS last_booking_at
FROM assets a
LEFT JOIN bookings b ON b.asset_id = a.id
LEFT JOIN LATERAL (
  SELECT u.department_id
  FROM allocations al
  JOIN users u ON u.id = al.holder_id
  WHERE al.asset_id = a.id
    AND al.holder_type = 'user'
    AND al.returned_at IS NULL
  ORDER BY al.allocated_at DESC
  LIMIT 1
) current_holder ON true
GROUP BY a.id, a.asset_tag, a.name, a.category_id, a.location, a.status, a.is_bookable,
  current_holder.department_id;

-- One row per asset with maintenance workload and recency.
CREATE VIEW v_maintenance_frequency AS
SELECT
  a.id AS asset_id,
  a.asset_tag,
  a.name AS asset_name,
  a.category_id,
  a.location,
  current_holder.department_id,
  COUNT(m.id)::integer AS request_count,
  COUNT(m.id) FILTER (WHERE m.status = 'resolved')::integer AS resolved_count,
  COUNT(m.id) FILTER (WHERE m.status NOT IN ('resolved', 'rejected'))::integer AS open_count,
  COUNT(m.id) FILTER (WHERE m.priority IN ('high', 'critical'))::integer AS high_priority_count
FROM assets a
LEFT JOIN maintenance_requests m ON m.asset_id = a.id
LEFT JOIN LATERAL (
  SELECT u.department_id
  FROM allocations al
  JOIN users u ON u.id = al.holder_id
  WHERE al.asset_id = a.id
    AND al.holder_type = 'user'
    AND al.returned_at IS NULL
  ORDER BY al.allocated_at DESC
  LIMIT 1
) current_holder ON true
GROUP BY a.id, a.asset_tag, a.name, a.category_id, a.location, current_holder.department_id;

-- Department-level custody and return-risk summary.
CREATE VIEW v_department_allocation_summary AS
SELECT
  d.id AS department_id,
  d.name AS department_name,
  COUNT(DISTINCT al.asset_id)::integer AS allocated_asset_count,
  COUNT(al.id)::integer AS active_allocation_count,
  COUNT(al.id) FILTER (WHERE al.expected_return_date < CURRENT_DATE)::integer AS overdue_return_count,
  COALESCE(SUM(a.acquisition_cost), 0)::numeric(14,2) AS allocated_acquisition_value
FROM departments d
LEFT JOIN users u ON u.department_id = d.id
LEFT JOIN allocations al
  ON al.holder_type = 'user'
  AND al.holder_id = u.id
  AND al.returned_at IS NULL
LEFT JOIN assets a ON a.id = al.asset_id
GROUP BY d.id, d.name;

-- Hour buckets are generated for every occupied hour in UTC, including multi-hour bookings.
CREATE VIEW v_booking_heatmap AS
SELECT
  EXTRACT(isodow FROM slot.hour_start)::integer AS day_of_week,
  EXTRACT(hour FROM slot.hour_start)::integer AS hour,
  COUNT(*)::integer AS booking_count,
  SUM(EXTRACT(epoch FROM (
    LEAST(b.end_time, (slot.hour_start + interval '1 hour') AT TIME ZONE 'UTC')
    - GREATEST(b.start_time, slot.hour_start AT TIME ZONE 'UTC')
  )) / 60)::bigint AS booked_minutes
FROM bookings b
CROSS JOIN LATERAL generate_series(
  date_trunc('hour', b.start_time AT TIME ZONE 'UTC'),
  date_trunc('hour', (b.end_time - interval '1 microsecond') AT TIME ZONE 'UTC'),
  interval '1 hour'
) AS slot(hour_start)
WHERE b.status NOT IN ('cancelled', 'no_show')
GROUP BY EXTRACT(isodow FROM slot.hour_start), EXTRACT(hour FROM slot.hour_start);

-- Organization-wide KPI row consumed by the dashboard/report layer.
CREATE VIEW v_dashboard_kpis AS
SELECT
  (SELECT COUNT(*)::integer FROM assets WHERE status = 'available') AS available_assets,
  (SELECT COUNT(*)::integer FROM assets WHERE status = 'allocated') AS allocated_assets,
  (SELECT COUNT(*)::integer FROM maintenance_requests
   WHERE status IN ('approved', 'technician_assigned', 'in_progress')) AS maintenance_today,
  (SELECT COUNT(*)::integer FROM bookings WHERE status IN ('upcoming', 'ongoing')) AS active_bookings,
  (SELECT COUNT(*)::integer FROM transfer_requests WHERE status = 'pending') AS pending_transfers,
  (SELECT COUNT(*)::integer FROM allocations
   WHERE returned_at IS NULL
     AND expected_return_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS upcoming_returns,
  (SELECT COUNT(*)::integer FROM allocations
   WHERE returned_at IS NULL AND expected_return_date < CURRENT_DATE) AS overdue_returns,
  (SELECT COUNT(*)::integer FROM v_ghost_risk) AS ghost_risk;

COMMIT;
