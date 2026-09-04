-- ============================================================================
-- Regulated: session tags (secondary categories)
--
-- ADDITIVE ONLY. Adds one nullable column and one column-level grant.
-- Nothing existing is dropped, renamed or retyped.
-- Safe to run more than once.
-- ============================================================================

alter table public.sessions
  add column if not exists tags text[];

-- The sessions table has column-level grants: anon and authenticated can only
-- select the columns named explicitly. Without this line the client's select()
-- fails outright with a permissions error, it does not silently return null.
grant select (tags) on public.sessions to anon, authenticated;
