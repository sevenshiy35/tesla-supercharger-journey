begin;

-- The `visit-photos` Storage bucket is intentionally NOT created here. It must be
-- created as a private bucket in the Supabase Dashboard after this migration is
-- reviewed. Policies can safely exist before the bucket does.

alter table public.visit_photos
  drop constraint if exists visit_photos_photo_type_check;

-- Phase 3A starts with no photo rows. Keep a deterministic mapping in case a
-- development database contains metadata created against the original schema.
update public.visit_photos
set photo_type = case photo_type
  when 'site' then 'check_in'
  when 'tesla_screen' then 'charger'
  when 'environment' then 'scenery'
  else photo_type
end
where photo_type in ('site', 'tesla_screen', 'environment');

alter table public.visit_photos
  alter column photo_type set default 'check_in',
  add column mime_type text,
  add column file_size_bytes bigint,
  add column width integer,
  add column height integer,
  add column display_order integer not null default 0,
  add column is_cover boolean not null default false,
  add constraint visit_photos_bucket_name_check
    check (bucket_name = 'visit-photos'),
  add constraint visit_photos_storage_path_not_blank_check
    check (storage_path = btrim(storage_path) and storage_path <> '' and storage_path !~ '\.\.'),
  add constraint visit_photos_photo_type_check
    check (photo_type in ('check_in', 'vehicle', 'charger', 'scenery', 'receipt', 'other')),
  add constraint visit_photos_caption_length_check
    check (caption is null or char_length(caption) <= 1000),
  add constraint visit_photos_mime_type_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  add constraint visit_photos_file_size_check
    check (file_size_bytes > 0),
  add constraint visit_photos_width_check
    check (width > 0),
  add constraint visit_photos_height_check
    check (height > 0),
  add constraint visit_photos_display_order_check
    check (display_order >= 0);

-- No production photo metadata exists before Phase 3A, so the new integrity
-- fields can become required without inventing values for legacy rows.
alter table public.visit_photos
  alter column mime_type set not null,
  alter column file_size_bytes set not null,
  alter column width set not null,
  alter column height set not null;

create index if not exists visit_photos_visit_id_idx
  on public.visit_photos (visit_id);
create index if not exists visit_photos_user_id_idx
  on public.visit_photos (user_id);
create index if not exists visit_photos_visit_display_order_idx
  on public.visit_photos (visit_id, display_order, created_at, id);
create index if not exists visit_photos_visit_cover_idx
  on public.visit_photos (visit_id, is_cover);
create unique index if not exists visit_photos_one_cover_per_visit_idx
  on public.visit_photos (visit_id)
  where is_cover = true;

comment on column public.visit_photos.taken_at is
  'EXIF DateTimeOriginal (or reliable CreateDate fallback), interpreted with its offset or the parent Visit IANA timezone. GPS EXIF is never stored.';
comment on column public.visit_photos.storage_path is
  'Server-generated path: auth-user-uuid/visit-uuid/photo-uuid.ext.';

-- A deliberately narrow public view is the only anonymous photo metadata
-- surface. It contains no user ID, bucket, Storage path, MIME type, or GPS.
create view public.public_visit_photos
with (security_barrier = true)
as
select
  vp.id,
  vp.visit_id,
  vp.caption,
  vp.taken_at,
  vp.width,
  vp.height,
  vp.display_order,
  vp.is_cover,
  vp.created_at
from public.visit_photos as vp
join public.station_visits as sv on sv.id = vp.visit_id
where vp.is_public = true
  and sv.is_public = true;

comment on view public.public_visit_photos is
  'Safe public photo DTO source. Storage paths remain private and are resolved only by the validated signing route.';

drop policy if exists "visit_photos_select_public" on public.visit_photos;
revoke select on table public.visit_photos from anon;
revoke insert, update, delete on table public.visit_photos from authenticated;
revoke all on table public.public_visit_photos from public, anon, authenticated;
grant select on table public.public_visit_photos to anon, authenticated;

-- Parse only the exact managed path shape. Invalid client paths return NULL
-- instead of throwing from a Storage RLS expression.
create or replace function public.visit_photo_storage_visit_id(p_name text)
returns uuid
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_parts text[];
begin
  v_parts := pg_catalog.string_to_array(p_name, '/');
  if pg_catalog.array_length(v_parts, 1) <> 3
    or v_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  then
    return null;
  end if;
  return v_parts[2]::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.visit_photo_storage_visit_id(text) from public, anon;
grant execute on function public.visit_photo_storage_visit_id(text) to authenticated;

drop policy if exists "visit_photos_storage_admin_insert" on storage.objects;
drop policy if exists "visit_photos_storage_admin_select" on storage.objects;
drop policy if exists "visit_photos_storage_admin_delete" on storage.objects;

create policy "visit_photos_storage_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'visit-photos'
  and (select public.is_app_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.visit_photo_storage_visit_id(name) is not null
  and exists (
    select 1
    from public.station_visits as sv
    where sv.id = public.visit_photo_storage_visit_id(name)
  )
);

create policy "visit_photos_storage_admin_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'visit-photos'
  and (select public.is_app_admin())
  and public.visit_photo_storage_visit_id(name) is not null
  and (
    exists (
      select 1
      from public.station_visits as sv
      where sv.id = public.visit_photo_storage_visit_id(name)
    )
    or exists (
      select 1
      from public.visit_photos as vp
      where vp.bucket_name = bucket_id and vp.storage_path = name
    )
  )
);

create policy "visit_photos_storage_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'visit-photos'
  and (select public.is_app_admin())
  and public.visit_photo_storage_visit_id(name) is not null
  and (
    exists (
      select 1
      from public.station_visits as sv
      where sv.id = public.visit_photo_storage_visit_id(name)
    )
    or exists (
      select 1
      from public.visit_photos as vp
      where vp.bucket_name = bucket_id and vp.storage_path = name
    )
  )
);

create or replace function public.admin_create_visit_photo(
  p_photo_id uuid,
  p_visit_id uuid,
  p_bucket_name text,
  p_storage_path text,
  p_photo_type text,
  p_caption text,
  p_is_public boolean,
  p_taken_at timestamptz,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_width integer,
  p_height integer
)
returns table (
  photo_id uuid,
  visit_id uuid,
  photo_type text,
  caption text,
  is_public boolean,
  taken_at timestamptz,
  mime_type text,
  file_size_bytes bigint,
  width integer,
  height integer,
  display_order integer,
  is_cover boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_photo public.visit_photos%rowtype;
  v_extension text;
  v_expected_path text;
  v_display_order integer;
  v_is_cover boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_photo_id is null or p_visit_id is null then
    raise exception using errcode = '22023', message = 'Photo ID and Visit ID are required.';
  end if;

  -- Serialize first-cover selection and same-ID retries per Visit.
  -- The second caller in a concurrent retry observes the first committed row.
  perform 1 from public.station_visits as sv where sv.id = p_visit_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Visit not found.';
  end if;

  select vp.* into v_photo
  from public.visit_photos as vp
  where vp.id = p_photo_id
  for update;
  if found then
    if v_photo.visit_id <> p_visit_id
      or v_photo.user_id <> v_user_id
      or v_photo.bucket_name <> p_bucket_name
      or v_photo.storage_path <> p_storage_path
    then
      raise exception using errcode = '23505', message = 'Photo ID conflicts with another object.';
    end if;
    return query select
      v_photo.id, v_photo.visit_id, v_photo.photo_type, v_photo.caption,
      v_photo.is_public, v_photo.taken_at, v_photo.mime_type,
      v_photo.file_size_bytes, v_photo.width, v_photo.height,
      v_photo.display_order, v_photo.is_cover, v_photo.created_at, v_photo.updated_at;
    return;
  end if;

  if p_bucket_name is distinct from 'visit-photos' then
    raise exception using errcode = '22023', message = 'Invalid photo bucket.';
  end if;
  if p_mime_type = 'image/jpeg' then v_extension := 'jpg';
  elsif p_mime_type = 'image/png' then v_extension := 'png';
  elsif p_mime_type = 'image/webp' then v_extension := 'webp';
  else
    raise exception using errcode = '22023', message = 'Unsupported photo MIME type.';
  end if;

  v_expected_path := v_user_id::text || '/' || p_visit_id::text || '/' || p_photo_id::text || '.' || v_extension;
  if p_storage_path is distinct from v_expected_path then
    raise exception using errcode = '22023', message = 'Invalid photo Storage path.';
  end if;
  if p_photo_type is null or p_photo_type not in ('check_in', 'vehicle', 'charger', 'scenery', 'receipt', 'other') then
    raise exception using errcode = '22023', message = 'Invalid photo type.';
  end if;
  if p_caption is not null and char_length(p_caption) > 1000 then
    raise exception using errcode = '22023', message = 'Caption must be 1,000 characters or fewer.';
  end if;
  if p_is_public is null then
    raise exception using errcode = '22023', message = 'Photo visibility is required.';
  end if;
  if p_file_size_bytes is null or p_file_size_bytes <= 0 then
    raise exception using errcode = '22023', message = 'Photo file size must be positive.';
  end if;
  if p_width is null or p_height is null or p_width <= 0 or p_height <= 0 then
    raise exception using errcode = '22023', message = 'Photo dimensions must be positive.';
  end if;

  select coalesce(max(vp.display_order), -1) + 1,
         count(*) = 0
  into v_display_order, v_is_cover
  from public.visit_photos as vp
  where vp.visit_id = p_visit_id;

  insert into public.visit_photos (
    id, visit_id, user_id, bucket_name, storage_path, photo_type, caption,
    is_public, taken_at, mime_type, file_size_bytes, width, height,
    display_order, is_cover
  ) values (
    p_photo_id, p_visit_id, v_user_id, p_bucket_name, p_storage_path, p_photo_type,
    nullif(p_caption, ''), p_is_public, p_taken_at, p_mime_type,
    p_file_size_bytes, p_width, p_height, v_display_order, v_is_cover
  )
  returning * into v_photo;

  return query select
    v_photo.id, v_photo.visit_id, v_photo.photo_type, v_photo.caption,
    v_photo.is_public, v_photo.taken_at, v_photo.mime_type,
    v_photo.file_size_bytes, v_photo.width, v_photo.height,
    v_photo.display_order, v_photo.is_cover, v_photo.created_at, v_photo.updated_at;
end;
$$;

create or replace function public.admin_update_visit_photo(
  p_photo_id uuid,
  p_photo_type text,
  p_caption text,
  p_is_public boolean
)
returns table (
  photo_id uuid,
  visit_id uuid,
  photo_type text,
  caption text,
  is_public boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_photo public.visit_photos%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_photo_type is null or p_photo_type not in ('check_in', 'vehicle', 'charger', 'scenery', 'receipt', 'other') then
    raise exception using errcode = '22023', message = 'Invalid photo type.';
  end if;
  if p_caption is not null and char_length(p_caption) > 1000 then
    raise exception using errcode = '22023', message = 'Caption must be 1,000 characters or fewer.';
  end if;
  if p_is_public is null then raise exception using errcode = '22023', message = 'Photo visibility is required.'; end if;

  update public.visit_photos as vp
  set photo_type = p_photo_type, caption = nullif(p_caption, ''), is_public = p_is_public
  where vp.id = p_photo_id
    and exists (select 1 from public.station_visits as sv where sv.id = vp.visit_id)
  returning vp.* into v_photo;
  if not found then raise exception using errcode = 'P0002', message = 'Photo not found.'; end if;
  return query select v_photo.id, v_photo.visit_id, v_photo.photo_type,
    v_photo.caption, v_photo.is_public, v_photo.updated_at;
end;
$$;

create or replace function public.admin_set_visit_cover_photo(p_visit_id uuid, p_photo_id uuid)
returns table (photo_id uuid, visit_id uuid, is_cover boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_photo public.visit_photos%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  perform 1 from public.station_visits as sv where sv.id = p_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Visit not found.'; end if;
  select vp.* into v_photo from public.visit_photos as vp
  where vp.id = p_photo_id and vp.visit_id = p_visit_id;
  if not found then raise exception using errcode = '22023', message = 'Photo does not belong to this Visit.'; end if;

  update public.visit_photos as vp set is_cover = false
  where vp.visit_id = p_visit_id and vp.is_cover = true;
  update public.visit_photos as vp set is_cover = true
  where vp.id = p_photo_id
  returning vp.* into v_photo;
  return query select v_photo.id, v_photo.visit_id, v_photo.is_cover, v_photo.updated_at;
end;
$$;

create or replace function public.admin_reorder_visit_photos(p_visit_id uuid, p_photo_ids uuid[])
returns table (photo_id uuid, display_order integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_count integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  perform 1 from public.station_visits as sv where sv.id = p_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Visit not found.'; end if;
  if p_photo_ids is null then raise exception using errcode = '22023', message = 'Photo order is required.'; end if;

  select count(*) into v_expected_count from public.visit_photos as vp where vp.visit_id = p_visit_id;
  if cardinality(p_photo_ids) <> v_expected_count
    or (select count(distinct ids.photo_id) from unnest(p_photo_ids) as ids(photo_id)) <> v_expected_count
    or exists (
      select 1 from unnest(p_photo_ids) as ids(photo_id)
      left join public.visit_photos as vp on vp.id = ids.photo_id and vp.visit_id = p_visit_id
      where vp.id is null
    )
  then
    raise exception using errcode = '22023', message = 'Photo order must contain every Photo from exactly one Visit.';
  end if;

  return query
  with requested as (
    select ids.photo_id, (ids.ordinality - 1)::integer as new_order
    from unnest(p_photo_ids) with ordinality as ids(photo_id, ordinality)
  ), updated as (
    update public.visit_photos as vp
    set display_order = requested.new_order
    from requested
    where vp.id = requested.photo_id and vp.visit_id = p_visit_id
    returning vp.id, vp.display_order
  )
  select updated.id, updated.display_order from updated order by updated.display_order;
end;
$$;

create or replace function public.admin_delete_visit_photo(p_photo_id uuid)
returns table (photo_id uuid, visit_id uuid, new_cover_photo_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_photo public.visit_photos%rowtype;
  v_new_cover uuid;
  v_visit_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  select vp.visit_id into v_visit_id from public.visit_photos as vp where vp.id = p_photo_id;
  if not found then raise exception using errcode = 'P0002', message = 'Photo not found.'; end if;
  perform 1 from public.station_visits as sv where sv.id = v_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Visit not found.'; end if;
  select vp.* into v_photo from public.visit_photos as vp
  where vp.id = p_photo_id and vp.visit_id = v_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Photo not found.'; end if;

  delete from public.visit_photos as vp where vp.id = p_photo_id;
  if v_photo.is_cover then
    select vp.id into v_new_cover
    from public.visit_photos as vp
    where vp.visit_id = v_photo.visit_id
    order by vp.display_order, vp.created_at, vp.id
    limit 1;
    if v_new_cover is not null then
      update public.visit_photos as vp set is_cover = true where vp.id = v_new_cover;
    end if;
  end if;
  return query select v_photo.id, v_photo.visit_id, v_new_cover;
end;
$$;

-- Replace Phase 2D's one-argument delete RPC with a contract that requires the
-- server action to supply the exact photo IDs whose Storage objects it removed.
drop function if exists public.admin_delete_station_visit(uuid);
create function public.admin_delete_station_visit(p_visit_id uuid, p_deleted_photo_ids uuid[])
returns table (visit_id uuid, station_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_visit public.station_visits%rowtype;
  v_photo_count integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_deleted_photo_ids is null then
    raise exception using errcode = '22023', message = 'Deleted photo IDs are required.';
  end if;

  select sv.* into v_visit from public.station_visits as sv
  where sv.id = p_visit_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Visit not found.'; end if;
  select count(*) into v_photo_count from public.visit_photos as vp where vp.visit_id = p_visit_id;
  if cardinality(p_deleted_photo_ids) <> v_photo_count
    or (select count(distinct ids.photo_id) from unnest(p_deleted_photo_ids) as ids(photo_id)) <> v_photo_count
    or exists (
      select 1 from unnest(p_deleted_photo_ids) as ids(photo_id)
      left join public.visit_photos as vp on vp.id = ids.photo_id and vp.visit_id = p_visit_id
      where vp.id is null
    )
  then
    raise exception using errcode = '40001', message = 'Photo metadata changed during Visit deletion. Manual repair may be required.';
  end if;

  delete from public.visit_photos as vp where vp.visit_id = p_visit_id;
  delete from public.charging_sessions as cs where cs.visit_id = p_visit_id;
  delete from public.station_visits as sv where sv.id = p_visit_id;
  return query select v_visit.id, v_visit.station_id;
end;
$$;

comment on function public.admin_create_visit_photo(uuid, uuid, text, text, text, text, boolean, timestamptz, text, bigint, integer, integer)
  is 'Admin-only idempotent photo Metadata creation. Auth identity and exact managed Storage path are enforced.';
comment on function public.admin_update_visit_photo(uuid, text, text, boolean)
  is 'Admin-only update limited to photo type, plain-text caption, and visibility.';
comment on function public.admin_set_visit_cover_photo(uuid, uuid)
  is 'Admin-only transactional cover replacement; one cover per Visit.';
comment on function public.admin_reorder_visit_photos(uuid, uuid[])
  is 'Admin-only complete-list reorder for photos from exactly one Visit.';
comment on function public.admin_delete_visit_photo(uuid)
  is 'Deletes photo Metadata after the protected server action has removed its Storage object and selects a replacement cover.';
comment on function public.admin_delete_station_visit(uuid, uuid[])
  is 'Deletes photo Metadata, Charging Session, and Visit only after the server action supplies the exact Storage-cleaned photo IDs. Stations remain.';

revoke all on function public.admin_create_visit_photo(uuid, uuid, text, text, text, text, boolean, timestamptz, text, bigint, integer, integer) from public, anon;
revoke all on function public.admin_update_visit_photo(uuid, text, text, boolean) from public, anon;
revoke all on function public.admin_set_visit_cover_photo(uuid, uuid) from public, anon;
revoke all on function public.admin_reorder_visit_photos(uuid, uuid[]) from public, anon;
revoke all on function public.admin_delete_visit_photo(uuid) from public, anon;
revoke all on function public.admin_delete_station_visit(uuid, uuid[]) from public, anon;

grant execute on function public.admin_create_visit_photo(uuid, uuid, text, text, text, text, boolean, timestamptz, text, bigint, integer, integer) to authenticated;
grant execute on function public.admin_update_visit_photo(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_set_visit_cover_photo(uuid, uuid) to authenticated;
grant execute on function public.admin_reorder_visit_photos(uuid, uuid[]) to authenticated;
grant execute on function public.admin_delete_visit_photo(uuid) to authenticated;
grant execute on function public.admin_delete_station_visit(uuid, uuid[]) to authenticated;

commit;
