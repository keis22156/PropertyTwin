-- Run in the Supabase SQL editor. No service-role key is used by the web app.
begin;
create schema if not exists private;
create table public.agencies (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 200),
 created_at timestamptz not null default now()
);
create table public.agency_members (
 agency_id uuid not null references public.agencies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','admin','agent','viewer')),
 created_at timestamptz not null default now(),
 primary key (agency_id,user_id)
);
create index agency_members_user_id on public.agency_members(user_id);
alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;
create function private.is_agency_member(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.agency_members where agency_id=target and user_id=(select auth.uid()));
$$;
revoke all on function private.is_agency_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_agency_member(uuid) to authenticated;
create policy agency_member_read on public.agencies for select to authenticated
 using ((select private.is_agency_member(id)));
create policy membership_read on public.agency_members for select to authenticated
 using ((select private.is_agency_member(agency_id)));
-- Membership and role writes are deliberately unavailable to clients. Invitations
-- need a dedicated transaction, rather than accepting a role from a browser.
revoke all on public.agencies, public.agency_members from anon, authenticated;
grant select on public.agencies, public.agency_members to authenticated;
create function public.create_agency(agency_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if agency_name is null or length(trim(agency_name)) not between 1 and 200 then raise exception 'Invalid agency name'; end if;
 insert into public.agencies(name) values(trim(agency_name)) returning id into result;
 insert into public.agency_members(agency_id,user_id,role) values(result,auth.uid(),'owner');
 return result;
end;
$$;
revoke all on function public.create_agency(text) from public, anon;
grant execute on function public.create_agency(text) to authenticated;
commit;
