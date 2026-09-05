-- Regulated: program schema prep for entry tracks and a day zero. Additive only.
-- Apply in the Supabase SQL editor. No content, no data changes.

-- Which track a person entered the program on. Null until they choose.
alter table public.profiles
  add column if not exists entry_track text
  check (entry_track in ('sleep', 'anxiety', 'stress'));

-- A day row that only applies to one track. Null means every track.
-- Ceiling: unique (program_id, week, day) still holds, so two rows for the same
-- day on different tracks need that unique widened to include entry_track.
-- That is a constraint change, so it waits for a decision, not this file.
alter table public.program_days
  add column if not exists entry_track text
  check (entry_track in ('sleep', 'anxiety', 'stress'));

-- The quick-win session before Day 1. program_days rejects day 0, so it hangs
-- off the program itself.
alter table public.programs
  add column if not exists day_zero_session_id uuid references public.sessions(id);
