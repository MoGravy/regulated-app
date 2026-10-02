begin;
create or replace function public.enqueue_care_log_push() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.care_push_jobs(event_id,kind,sender_id,recipient_id,client_id,practitioner_id,subscription_id)
    select new.id,'task',t.client_id,t.practitioner_id,t.client_id,t.practitioner_id,s.id
    from public.care_tasks t
    join public.care_links l on l.client_id=t.client_id and l.practitioner_id=t.practitioner_id
    join public.care_push_subscriptions s on s.user_id=t.practitioner_id
    where t.id=new.task_id and l.active
    on conflict do nothing;
  return new;
end $$;
revoke all on function public.enqueue_care_log_push() from public,anon,authenticated;
drop trigger if exists enqueue_task_log_push on public.care_task_entries;
create trigger enqueue_task_log_push after insert on public.care_task_entries
  for each row execute function public.enqueue_care_log_push();
commit;
