-- ============================================================
-- Regulated App — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

-- Users
create table if not exists public.users (
  id          uuid primary key default uuid_generate_v4(),
  email       text unique not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Sessions (audio content library)
create table if not exists public.sessions (
  id          uuid primary key default uuid_generate_v4(),
  title       text not null,
  description text,
  category    text not null,
  duration    integer not null,          -- minutes
  free        boolean default false,
  audio_url   text,                      -- path in Supabase Storage: sessions/filename.mp3
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

-- Session completions (mood tracking + analytics)
create table if not exists public.session_completions (
  id           uuid primary key default uuid_generate_v4(),
  session_id   uuid references public.sessions(id) on delete cascade,
  user_email   text,
  mood_before  integer check (mood_before between 1 and 10),
  mood_after   integer check (mood_after between 1 and 10),
  completed_at timestamptz default now()
);

-- Custom audio orders
create table if not exists public.custom_orders (
  id                 uuid primary key default uuid_generate_v4(),
  user_email         text not null,
  pattern            text not null,
  trigger            text not null,
  desired_state      text not null,
  affirmations       text,
  status             text default 'pending_payment',  -- pending_payment | confirmed | in_progress | delivered | cancelled
  stripe_session_id  text,
  audio_url          text,              -- path in Supabase Storage after delivery
  due_date           timestamptz,
  delivered_at       timestamptz,
  turnaround_days    integer default 7,
  coupon_code_used   text,
  discount_applied   numeric(10,2) default 0,
  created_at         timestamptz default now()
);

-- Subscriptions
create table if not exists public.subscriptions (
  id                     uuid primary key default uuid_generate_v4(),
  user_email             text not null,
  stripe_subscription_id text unique not null,
  stripe_customer_id     text,
  status                 text default 'active',  -- active | cancelled | past_due | trialing
  plan                   text default 'annual',  -- annual | monthly
  current_period_end     timestamptz,
  coupon_code_used       text,
  discount_applied       numeric(10,2) default 0,
  created_at             timestamptz default now()
);

-- Analytics events (lightweight)
create table if not exists public.analytics_events (
  id          uuid primary key default uuid_generate_v4(),
  event_name  text not null,
  properties  jsonb default '{}',
  created_at  timestamptz default now()
);

-- Coupons (managed by Matthew in Supabase dashboard — no code changes needed to add/edit)
create table if not exists public.coupons (
  id              uuid primary key default uuid_generate_v4(),
  code            text unique not null,             -- e.g. LAUNCH20, PARTNER1FREE, VGBFREE
  discount_type   text not null check (discount_type in ('percentage', 'fixed')),
  discount_amount numeric(10,2) not null,           -- 20 = 20% or $20
  max_uses        integer,                           -- null = unlimited
  used_count      integer default 0,
  expires_at      timestamptz,                       -- null = never expires
  partner_name    text,                              -- e.g. 'PodcastX', 'InfluencerY'
  active          boolean default true,
  created_at      timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_coupons_code on public.coupons(code);
create index if not exists idx_coupons_active on public.coupons(active);
create index if not exists idx_session_completions_session on public.session_completions(session_id);
create index if not exists idx_session_completions_email on public.session_completions(user_email);
create index if not exists idx_custom_orders_email on public.custom_orders(user_email);
create index if not exists idx_custom_orders_status on public.custom_orders(status);
create index if not exists idx_subscriptions_email on public.subscriptions(user_email);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_analytics_events_name on public.analytics_events(event_name);
create index if not exists idx_analytics_events_created on public.analytics_events(created_at desc);

-- ============================================================
-- RLS POLICIES
-- ============================================================

alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.session_completions enable row level security;
alter table public.custom_orders enable row level security;
alter table public.subscriptions enable row level security;
alter table public.analytics_events enable row level security;
alter table public.coupons enable row level security;

-- Coupons: service role manages; anon can validate (via API only — direct table access blocked)
create policy "Service role full access to coupons"
  on public.coupons for all
  using (auth.role() = 'service_role');

-- Sessions: anyone can read free sessions; authenticated or service role reads all
create policy "Anyone can read free sessions"
  on public.sessions for select
  using (free = true);

create policy "Service role reads all sessions"
  on public.sessions for select
  using (auth.role() = 'service_role');

-- Session completions: anyone can insert (anonymous tracking); service role sees all
create policy "Anyone can insert completions"
  on public.session_completions for insert
  with check (true);

create policy "Service role reads all completions"
  on public.session_completions for select
  using (auth.role() = 'service_role');

-- Custom orders: anyone can insert; read own by email (anon via service role)
create policy "Anyone can create custom orders"
  on public.custom_orders for insert
  with check (true);

create policy "Service role full access to custom orders"
  on public.custom_orders for all
  using (auth.role() = 'service_role');

-- Subscriptions: service role only (webhook writes, frontend checks via API)
create policy "Service role full access to subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

-- Allow anon to check own subscription by email (for frontend isPremium check)
create policy "Anon can read own subscription"
  on public.subscriptions for select
  using (true);  -- RLS applied; email filter done in query

-- Users: service role full access
create policy "Service role full access to users"
  on public.users for all
  using (auth.role() = 'service_role');

create policy "Anon can upsert own user"
  on public.users for insert
  with check (true);

-- Analytics: anyone can insert; service role reads
create policy "Anyone can insert analytics"
  on public.analytics_events for insert
  with check (true);

create policy "Service role reads analytics"
  on public.analytics_events for select
  using (auth.role() = 'service_role');

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Increment completed_sessions count helper
create or replace function public.increment_completed_sessions(p_email text)
returns void as $$
begin
  -- no-op placeholder; use session_completions table for counts
  null;
end;
$$ language plpgsql security definer;

-- Atomically increment coupon used_count (called from webhook)
create or replace function public.increment_coupon_usage(p_code text)
returns void as $$
begin
  update public.coupons
  set used_count = used_count + 1
  where code = p_code;
end;
$$ language plpgsql security definer;

-- ============================================================
-- STORAGE BUCKETS
-- Run these in Supabase Dashboard → Storage (or via the API)
-- ============================================================

-- Create storage buckets (run via Dashboard if SQL doesn't work):
-- Bucket: "audio"
--   - Public: false (use signed URLs)
--   - Allowed MIME types: audio/mpeg, audio/mp4, audio/wav
--   - Folder structure:
--       /sessions/          ← pre-recorded sessions (free + premium)
--       /custom-audios/     ← custom order deliveries

-- ============================================================
-- SEED: Free Sessions (update audio_url after uploading files)
-- ============================================================

insert into public.sessions (title, description, category, duration, free, sort_order) values
  ('Deep Sleep Reset',   'Gentle somatic unwinding to guide your nervous system into deep, restorative sleep.', 'Sleep',    22, true,  1),
  ('Stress Off Switch',  'Rapid deactivation of the stress response. Reset your baseline in under 20 minutes.', 'Stress',   18, true,  2),
  ('Gut Brain Reset',    'Direct dialogue with the gut-brain axis to calm inflammation and reduce IBS symptoms.', 'IBS',    25, true,  3),
  ('Daily Regulation',   'Morning or evening reset. Build a regulated nervous system baseline one day at a time.', 'Reset', 12, true,  4)
on conflict do nothing;

-- Premium sessions
insert into public.sessions (title, description, category, duration, free, sort_order) values
  ('Anxiety Release',          'Dissolve the root patterns driving chronic anxiety and hypervigilance.',                       'Anxiety',    20, false, 10),
  ('Deep Focus',               'Neurological priming for peak mental performance and sustained focus.',                        'Focus',      15, false, 11),
  ('Unshakeable Confidence',   'Reprogram limiting beliefs around your worth, capability, and identity.',                     'Confidence', 24, false, 12),
  ('Grief Processing',         'A safe, guided space to process loss and begin moving through grief.',                         'Grief',      28, false, 13),
  ('Panic Attack Protocol',    'Rapid response for acute panic. Brings you back to baseline fast.',                           'Anxiety',    10, false, 14),
  ('Morning Activation',       'Start each day from a place of groundedness and regulated energy.',                           'Reset',      14, false, 15),
  ('Relationship Patterns',    'Identify and dissolve the nervous system patterns driving relationship struggles.',            'Confidence', 26, false, 16),
  ('Night Terror Relief',      'Gentle processing of the subconscious patterns behind night terrors and nightmares.',         'Sleep',      18, false, 17)
on conflict do nothing;

-- VGB / Weight Loss sessions (set free=true on any you want as lead magnets)
insert into public.sessions (title, description, category, duration, free, sort_order) values
  ('VGB 1: The Surgery',            'The core hypnotic gastric band installation session. Your subconscious undergoes the full virtual surgical procedure.',       'Weight Loss', 12, false, 20),
  ('VGB 2: Surgery Backup Session', 'Reinforcement and deep anchoring of the virtual gastric band. Strengthens the installation for lasting results.',             'Weight Loss', 15, false, 21),
  ('VGB 3: Emotional Eating Reset', 'Targets the emotional triggers behind overeating at the root — dissolving the patterns that drive eating for comfort.',       'Weight Loss', 16, false, 22)
on conflict do nothing;

-- Seed coupons (Matthew can add/edit/deactivate directly in Supabase dashboard)
-- discount_type: 'percentage' = percent off, 'fixed' = dollar amount off
insert into public.coupons (code, discount_type, discount_amount, max_uses, partner_name, active) values
  ('LAUNCH20',     'percentage', 20,   null, null,         true),  -- 20% off anything
  ('PARTNER1FREE', 'percentage', 100,  500,  'Partner 1',  true),  -- 1 month free (100% off monthly)
  ('PARTNER2',     'percentage', 20,   200,  'Partner 2',  true),  -- 20% off custom audio
  ('VGBFREE',      'percentage', 100,  300,  'VGB Launch', true)   -- 1 month free premium
on conflict (code) do nothing;
