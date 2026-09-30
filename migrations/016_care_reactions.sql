begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.care_message_reactions (
  message_id uuid not null references public.care_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢')),
  primary key (message_id, user_id)
);
alter table public.care_message_reactions enable row level security;

-- Reuse message RLS: only participants in an active link can see reactions.
drop policy if exists "message participants read reactions" on public.care_message_reactions;
create policy "message participants read reactions" on public.care_message_reactions
  for select to authenticated using (exists (
    select 1 from public.care_messages m where m.id = message_id
  ));
drop policy if exists "participants insert own reactions" on public.care_message_reactions;
create policy "participants insert own reactions" on public.care_message_reactions
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.care_messages m where m.id = message_id
    )
  );
drop policy if exists "participants update own reactions" on public.care_message_reactions;
create policy "participants update own reactions" on public.care_message_reactions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.care_messages m where m.id = message_id
  ));
drop policy if exists "participants remove own reactions" on public.care_message_reactions;
create policy "participants remove own reactions" on public.care_message_reactions
  for delete to authenticated using (user_id = (select auth.uid()) and exists (
    select 1 from public.care_messages m where m.id = message_id
  ));

revoke all on public.care_message_reactions from anon, authenticated;
grant select, insert, update, delete on public.care_message_reactions to authenticated;
grant all on public.care_message_reactions to service_role;
commit;
