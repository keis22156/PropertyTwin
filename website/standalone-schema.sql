begin;
create schema private;
create table public.agencies(id uuid primary key, name text not null);
-- The workspace row is the transaction lock; business entities have their own rows.
create table private.workspaces (
 agency_id uuid primary key references public.agencies(id) on delete cascade,
 workspace jsonb not null default '{}', media jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
create table public.properties (
 slug text primary key, agency_id uuid not null references public.agencies(id) on delete cascade,
 data jsonb not null check(jsonb_typeof(data)='object'),
 unique(agency_id,slug)
);
create table public.property_rooms (
 agency_id uuid not null, slug text not null, id text not null, data jsonb not null,
 primary key(slug,id), foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create table public.roomplan_assets (
 agency_id uuid not null, slug text primary key, data jsonb not null,
 foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create table private.buyer_sessions (
 id text primary key, agency_id uuid not null, slug text not null, data jsonb not null,
 foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create table private.smart_links (
 id text primary key, agency_id uuid not null, slug text not null, data jsonb not null,
 foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create table public.leads (
 id text primary key, agency_id uuid not null, slug text not null, data jsonb not null,
 foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create table public.variants (
 id text primary key, agency_id uuid not null, slug text not null, data jsonb not null,
 foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create table public.business_records (
 id text primary key, agency_id uuid not null, slug text not null, data jsonb not null,
 foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create table private.ai_jobs (
 id text primary key, agency_id uuid not null, slug text not null, data jsonb not null,
 status text generated always as (data->>'status') stored,
 principal text generated always as (data->>'principal') stored,
 idempotency_key text generated always as (data->>'idempotencyKey') stored,
 constraint job_state check(status in ('queued','processing','completed','failed')),
 unique(agency_id,slug,principal,idempotency_key),
 foreign key(agency_id,slug) references public.properties(agency_id,slug) on delete cascade
);
create index ai_jobs_queue on private.ai_jobs(status,agency_id) where status in ('queued','processing');
create table private.media_files (
 url text primary key, agency_id uuid not null references public.agencies(id) on delete cascade
);

alter table public.properties add column position integer not null default 0;
do $$ declare item text; begin
 foreach item in array array['private.buyer_sessions','private.smart_links','public.leads','public.variants','public.business_records','private.ai_jobs'] loop
  execute format('alter table %s add column position integer not null default 0',item);
 end loop;
end $$;

alter table private.workspaces add column uploads jsonb not null default '{}';
alter table private.media_files add column metadata jsonb not null default '{}';
-- Only the backend's database role has access; clients use the authenticated API.
revoke all on schema private from public;
commit;
