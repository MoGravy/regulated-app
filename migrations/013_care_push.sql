begin;
create table if not exists public.care_push_subscriptions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.care_push_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  kind text not null check (kind in ('message', 'task')),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  practitioner_id uuid not null,
  subscription_id text not null references public.care_push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'sent', 'cancelled')),
  attempts integer not null default 0,
  leased_until timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, kind, subscription_id)
);
alter table public.care_push_subscriptions enable row level security;
alter table public.care_push_jobs enable row level security;
revoke all on public.care_push_subscriptions, public.care_push_jobs from public, anon, authenticated;
grant all on public.care_push_subscriptions, public.care_push_jobs to service_role;
create index if not exists care_push_jobs_pending_idx on public.care_push_jobs(created_at) where state='pending';

create or replace function public.enqueue_care_push() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; sender uuid; event_kind text;
begin
  if tg_table_name='care_messages' then
    sender := new.sender_id;
    recipient := case when sender=new.client_id then new.practitioner_id else new.client_id end;
    event_kind := 'message';
  else
    sender := new.practitioner_id; recipient := new.client_id; event_kind := 'task';
  end if;
  insert into public.care_push_jobs(event_id,kind,sender_id,recipient_id,client_id,practitioner_id,subscription_id)
    select new.id,event_kind,sender,recipient,new.client_id,new.practitioner_id,s.id
    from public.care_push_subscriptions s where s.user_id=recipient
    on conflict do nothing;
  return new;
end $$;
revoke all on function public.enqueue_care_push() from public,anon,authenticated;
drop trigger if exists enqueue_message_push on public.care_messages;
create trigger enqueue_message_push after insert on public.care_messages
  for each row execute function public.enqueue_care_push();
drop trigger if exists enqueue_task_push on public.care_tasks;
create trigger enqueue_task_push after insert on public.care_tasks
  for each row execute function public.enqueue_care_push();

create or replace function public.claim_care_push(actor uuid default null)
returns setof public.care_push_jobs language sql security definer set search_path=public,pg_temp as $$
  update public.care_push_jobs set leased_until=now()+interval '2 minutes',attempts=attempts+1
  where id in (
    select id from public.care_push_jobs where state='pending' and attempts<5
      and created_at>now()-interval '1 day'
      and (leased_until is null or leased_until<now())
      and (actor is null or sender_id=actor or recipient_id=actor)
    order by created_at for update skip locked limit 30
  ) returning *;
$$;
revoke all on function public.claim_care_push(uuid) from public,anon,authenticated;
grant execute on function public.claim_care_push(uuid) to service_role;
commit;
