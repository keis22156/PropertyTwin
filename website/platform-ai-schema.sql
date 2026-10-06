begin;
create table if not exists private.ai_routing (
 singleton boolean primary key default true check(singleton),
 config jsonb not null check(jsonb_typeof(config)='object'),
 updated_at timestamptz not null default now()
);
alter table private.ai_routing enable row level security;
revoke all on private.ai_routing from public;
commit;
