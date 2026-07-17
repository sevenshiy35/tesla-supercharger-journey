-- Trip-level travel photos are deliberately separate from charging-station
-- Visit photos. A Trip may own any number of photos; Storage and device limits
-- are the only practical caps.

create table public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_name text not null default 'trip-photos',
  storage_path text not null,
  caption text,
  is_public boolean not null default true,
  taken_at timestamptz,
  mime_type text not null,
  file_size_bytes bigint not null,
  width integer not null,
  height integer not null,
  display_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_photos_storage_path_key unique (bucket_name, storage_path),
  constraint trip_photos_bucket_name_check check (bucket_name = 'trip-photos'),
  constraint trip_photos_storage_path_check
    check (storage_path = btrim(storage_path) and storage_path <> '' and storage_path !~ '\.\.'),
  constraint trip_photos_caption_length_check
    check (caption is null or char_length(caption) <= 1000),
  constraint trip_photos_mime_type_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint trip_photos_file_size_check check (file_size_bytes > 0),
  constraint trip_photos_width_check check (width > 0),
  constraint trip_photos_height_check check (height > 0),
  constraint trip_photos_display_order_check check (display_order >= 0)
);

create trigger trip_photos_set_updated_at
before update on public.trip_photos
for each row execute function public.set_updated_at();

create index trip_photos_trip_plan_id_idx
  on public.trip_photos (trip_plan_id, display_order, created_at, id);
create index trip_photos_user_id_idx on public.trip_photos (user_id);
create unique index trip_photos_one_cover_per_trip_idx
  on public.trip_photos (trip_plan_id) where is_cover;

alter table public.trip_photos enable row level security;

create policy "trip_photos_select_admin"
on public.trip_photos for select to authenticated
using ((select public.is_app_admin()) and user_id = (select auth.uid()));

create policy "trip_photos_insert_admin"
on public.trip_photos for insert to authenticated
with check (
  (select public.is_app_admin())
  and user_id = (select auth.uid())
  and exists (
    select 1 from public.trip_plans as tp
    where tp.id = trip_plan_id and tp.user_id = (select auth.uid())
  )
);

create policy "trip_photos_update_admin"
on public.trip_photos for update to authenticated
using ((select public.is_app_admin()) and user_id = (select auth.uid()))
with check ((select public.is_app_admin()) and user_id = (select auth.uid()));

create policy "trip_photos_delete_admin"
on public.trip_photos for delete to authenticated
using ((select public.is_app_admin()) and user_id = (select auth.uid()));

revoke all on table public.trip_photos from public, anon;
grant select, insert, update, delete on table public.trip_photos to authenticated;

-- Keep the bucket private. Images are viewed through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false)
on conflict (id) do update set public = false;

create or replace function public.trip_photo_storage_trip_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_parts text[];
begin
  v_parts := string_to_array(object_name, '/');
  if cardinality(v_parts) <> 3 then return null; end if;
  return v_parts[2]::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.trip_photo_storage_trip_id(text) from public, anon;
grant execute on function public.trip_photo_storage_trip_id(text) to authenticated;

create policy "trip_photos_storage_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'trip-photos'
  and (select public.is_app_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.trip_plans as tp
    where tp.id = public.trip_photo_storage_trip_id(name)
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_photos_storage_admin_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'trip-photos'
  and (select public.is_app_admin())
  and (
    exists (
      select 1 from public.trip_plans as tp
      where tp.id = public.trip_photo_storage_trip_id(name)
        and tp.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.trip_photos as photo
      where photo.bucket_name = bucket_id
        and photo.storage_path = name
        and photo.user_id = (select auth.uid())
    )
  )
);

create policy "trip_photos_storage_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'trip-photos'
  and (select public.is_app_admin())
  and exists (
    select 1 from public.trip_photos as photo
    where photo.bucket_name = bucket_id
      and photo.storage_path = name
      and photo.user_id = (select auth.uid())
  )
);

comment on table public.trip_photos is
  'Unlimited travel-photo metadata owned by a Trip Plan; separate from 1-2 charging photos on a Visit.';
