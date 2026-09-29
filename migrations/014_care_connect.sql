begin;
create or replace function public.connect_care_account(target_email text, practitioner uuid, display_name text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare client uuid;
begin
  if length(btrim(display_name)) not between 1 and 100 then return false; end if;
  select id into client from auth.users where lower(email)=lower(btrim(target_email))
    and email_confirmed_at is not null;
  if client is null or client=practitioner then return false; end if;
  insert into public.care_links(client_id,practitioner_id,client_label,practitioner_label,active)
    values(client,practitioner,btrim(display_name),'Matthew',true)
    on conflict(client_id,practitioner_id) do update set client_label=excluded.client_label,active=true;
  return true;
end $$;
revoke all on function public.connect_care_account(text,uuid,text) from public,anon,authenticated;
grant execute on function public.connect_care_account(text,uuid,text) to service_role;
commit;
