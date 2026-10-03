begin;

-- Supabase defaults grant server execution; these helpers run only as triggers.
revoke all on function public.guard_progress_plan() from service_role;
revoke all on function public.freeze_deleted_progress() from service_role;

commit;
