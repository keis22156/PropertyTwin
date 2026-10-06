begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('propertytwin-media','propertytwin-media',false,50000000,array['image/jpeg','image/png','image/webp','model/gltf-binary','model/vnd.usdz+zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive policies also prevent a broad unrelated policy from granting
-- direct JWT access to this bucket. Authorized backend and signed tokens only.
create policy propertytwin_backend_only on storage.objects as restrictive
 for all to anon,authenticated
 using(bucket_id <> 'propertytwin-media') with check(bucket_id <> 'propertytwin-media');
commit;
