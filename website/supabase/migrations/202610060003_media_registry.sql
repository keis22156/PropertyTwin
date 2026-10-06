begin;
alter table private.workspaces add column uploads jsonb not null default '{}';
alter table private.media_files add column metadata jsonb not null default '{}';
commit;
