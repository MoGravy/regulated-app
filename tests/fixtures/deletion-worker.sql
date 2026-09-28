create table proof_clock (instant timestamptz not null);
create table proof_requests (
  id text primary key, account_id text not null unique,
  requested_at timestamptz not null,
  review_due_at timestamptz not null,
  ordinary_due_at timestamptz not null,
  reviewed_at timestamptz,
  ordinary_state text not null default 'pending',
  held_state text not null default 'pending',
  next_run_at timestamptz,
  generation integer not null default 0,
  lease_owner text, lease_until timestamptz,
  failures integer not null default 0, last_error text
);
create table proof_operations (
  id text primary key, request_id text not null references proof_requests(id),
  kind text not null, resource_id text not null,
  owner_id text not null, expected_version integer not null,
  fact_version integer,
  approved boolean not null default false,
  state text not null default 'pending', hold_through date
);
create table proof_ordinary (id text primary key, owner_id text not null, version integer not null);
create table proof_clinical (
  id text primary key, owner_id text not null, version integer not null,
  fact_version integer not null,
  verified boolean not null, source text,
  last_contact_date date, date_of_birth date, ever_seen_as_minor boolean,
  all_holds_verified boolean not null default false, other_hold_through date
);
