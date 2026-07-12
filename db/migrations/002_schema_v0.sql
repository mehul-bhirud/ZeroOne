BEGIN;

CREATE TYPE user_role AS ENUM ('admin', 'asset_manager', 'department_head', 'employee');
CREATE TYPE user_status AS ENUM ('active', 'inactive');
CREATE TYPE asset_status AS ENUM ('available', 'allocated', 'reserved', 'under_maintenance', 'lost', 'retired', 'disposed');
CREATE TYPE transfer_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE booking_status AS ENUM ('upcoming', 'ongoing', 'completed', 'cancelled', 'no_show');
CREATE TYPE maintenance_status AS ENUM ('pending', 'approved', 'rejected', 'technician_assigned', 'in_progress', 'resolved');
CREATE TYPE audit_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE audit_result AS ENUM ('verified', 'missing', 'damaged');

CREATE SEQUENCE asset_tag_seq START WITH 1;

CREATE TABLE departments (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  parent_department_id uuid REFERENCES departments(id),
  head_user_id uuid,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'employee',
  department_id uuid REFERENCES departments(id),
  status user_status NOT NULL DEFAULT 'active'
);

ALTER TABLE departments
  ADD CONSTRAINT departments_head_user_fk FOREIGN KEY (head_user_id) REFERENCES users(id);

CREATE TABLE asset_categories (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX asset_categories_custom_fields_gin ON asset_categories USING gin (custom_fields);

CREATE TABLE assets (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  category_id uuid NOT NULL REFERENCES asset_categories(id),
  asset_tag text NOT NULL UNIQUE DEFAULT ('AF-' || lpad(nextval('asset_tag_seq')::text, 4, '0')),
  serial_number text NOT NULL UNIQUE,
  acquisition_date date NOT NULL,
  acquisition_cost numeric(14,2) NOT NULL DEFAULT 0,
  condition text NOT NULL,
  location text NOT NULL,
  is_bookable boolean NOT NULL DEFAULT false,
  status asset_status NOT NULL DEFAULT 'available',
  photo_url text,
  last_verified_at timestamptz
);

CREATE TABLE allocations (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id),
  holder_type text NOT NULL,
  holder_id uuid NOT NULL,
  expected_return_date date,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  return_condition_notes text
);

CREATE TABLE transfer_requests (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id),
  from_holder jsonb NOT NULL,
  to_holder jsonb NOT NULL,
  status transfer_status NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES users(id),
  approved_by uuid REFERENCES users(id)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id),
  booked_by uuid NOT NULL REFERENCES users(id),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status booking_status NOT NULL DEFAULT 'upcoming',
  CHECK (end_time > start_time)
);

CREATE TABLE maintenance_requests (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id),
  raised_by uuid NOT NULL REFERENCES users(id),
  issue_description text NOT NULL,
  priority text NOT NULL,
  photo_url text,
  status maintenance_status NOT NULL DEFAULT 'pending',
  technician text
);

CREATE TABLE audit_cycles (
  id uuid PRIMARY KEY,
  scope_department_id uuid REFERENCES departments(id),
  scope_location text,
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  status audit_status NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL REFERENCES users(id),
  CHECK (date_range_end >= date_range_start)
);

CREATE TABLE audit_assignments (
  id uuid PRIMARY KEY,
  audit_cycle_id uuid NOT NULL REFERENCES audit_cycles(id),
  auditor_id uuid NOT NULL REFERENCES users(id),
  UNIQUE (audit_cycle_id, auditor_id)
);

CREATE TABLE audit_findings (
  id uuid PRIMARY KEY,
  audit_cycle_id uuid NOT NULL REFERENCES audit_cycles(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  result audit_result NOT NULL,
  notes text,
  UNIQUE (audit_cycle_id, asset_id)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false
);

CREATE TABLE activity_log (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMIT;

