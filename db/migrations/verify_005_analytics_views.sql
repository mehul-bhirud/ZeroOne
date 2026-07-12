BEGIN;

DO $$
DECLARE
  ghost_count integer;
  utilization_count integer;
  maintenance_count integer;
  department_count integer;
  heatmap_count integer;
  kpi_row record;
BEGIN
  SELECT count(*) INTO ghost_count FROM v_ghost_risk;
  IF ghost_count < 1 THEN
    RAISE EXCEPTION 'analytics verification failed: v_ghost_risk is empty';
  END IF;

  SELECT count(*) INTO utilization_count FROM v_utilization;
  IF utilization_count <> (SELECT count(*) FROM assets) THEN
    RAISE EXCEPTION 'analytics verification failed: v_utilization must have one row per asset';
  END IF;

  SELECT count(*) INTO maintenance_count FROM v_maintenance_frequency;
  IF maintenance_count <> (SELECT count(*) FROM assets) THEN
    RAISE EXCEPTION 'analytics verification failed: v_maintenance_frequency must have one row per asset';
  END IF;

  SELECT count(*) INTO department_count FROM v_department_allocation_summary;
  IF department_count <> (SELECT count(*) FROM departments) THEN
    RAISE EXCEPTION 'analytics verification failed: department summary must include empty departments';
  END IF;

  SELECT count(*) INTO heatmap_count FROM v_booking_heatmap WHERE booking_count > 0;
  IF heatmap_count < 1 THEN
    RAISE EXCEPTION 'analytics verification failed: booking heatmap has no occupied cells';
  END IF;

  SELECT * INTO kpi_row FROM v_dashboard_kpis;
  IF kpi_row.active_bookings < 1 OR kpi_row.pending_transfers < 1 OR kpi_row.ghost_risk < 1 THEN
    RAISE EXCEPTION 'analytics verification failed: dashboard KPI row is not populated';
  END IF;
END $$;

ROLLBACK;
