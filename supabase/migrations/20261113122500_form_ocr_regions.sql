-- PORTKAR form, KTP image storage, and region lookup migration.
-- Safe for an existing installation: additive changes only; no candidate rows are deleted.

alter table public.applicants
  add column if not exists ktp_path text;

create table if not exists public.regions_provinces (
  id text primary key,
  code text not null unique,
  name text not null
);
create table if not exists public.regions_regencies (
  id text primary key,
  province_id text not null references public.regions_provinces(id) on update cascade,
  code text not null unique,
  name text not null
);
create table if not exists public.regions_districts (
  id text primary key,
  regency_id text not null references public.regions_regencies(id) on update cascade,
  code text not null unique,
  name text not null
);
create table if not exists public.regions_villages (
  id text primary key,
  district_id text not null references public.regions_districts(id) on update cascade,
  code text not null unique,
  name text not null,
  area_type text not null default 'Desa' check (area_type in ('Desa','Kelurahan')),
  postal_code text
);

create index if not exists regions_regencies_province_idx
  on public.regions_regencies(province_id, name);
create index if not exists regions_districts_regency_idx
  on public.regions_districts(regency_id, name);
create index if not exists regions_villages_district_idx
  on public.regions_villages(district_id, name);
create index if not exists regions_villages_name_prefix_idx
  on public.regions_villages(district_id, lower(name) text_pattern_ops);
create index if not exists regions_villages_postal_idx
  on public.regions_villages(postal_code) where postal_code is not null;

alter table public.regions_provinces enable row level security;
alter table public.regions_regencies enable row level security;
alter table public.regions_districts enable row level security;
alter table public.regions_villages enable row level security;
revoke all on public.regions_provinces, public.regions_regencies,
  public.regions_districts, public.regions_villages
  from public, anon, authenticated;

create or replace function public.list_region_provinces()
returns table(id text, name text)
language sql stable security definer
set search_path = ''
as $$
  select p.id, p.name
  from public.regions_provinces p
  order by p.name;
$$;

create or replace function public.list_region_regencies(p_province_id text)
returns table(id text, name text)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.name
  from public.regions_regencies r
  where r.province_id = p_province_id
  order by r.name;
$$;

create or replace function public.list_region_districts(p_regency_id text)
returns table(id text, name text)
language sql stable security definer
set search_path = ''
as $$
  select d.id, d.name
  from public.regions_districts d
  where d.regency_id = p_regency_id
  order by d.name;
$$;

create or replace function public.list_region_villages(
  p_district_id text,
  p_search text default null,
  p_limit integer default 30
)
returns table(id text, name text, area_type text)
language sql stable security definer
set search_path = ''
as $$
  select v.id, v.name, v.area_type
  from public.regions_villages v
  where v.district_id = p_district_id
    and (
      nullif(trim(p_search), '') is null
      or lower(v.name) like lower(left(trim(p_search), 60)) || '%'
    )
  order by v.name
  limit greatest(1, least(coalesce(p_limit, 30), 30));
$$;

create or replace function public.get_region_postal_code(p_village_id text)
returns text
language sql stable security definer
set search_path = ''
as $$
  select v.postal_code
  from public.regions_villages v
  where v.id = p_village_id;
$$;

revoke all on function public.list_region_provinces() from public;
revoke all on function public.list_region_regencies(text) from public;
revoke all on function public.list_region_districts(text) from public;
revoke all on function public.list_region_villages(text,text,integer) from public;
revoke all on function public.get_region_postal_code(text) from public;
grant execute on function public.list_region_provinces() to anon, authenticated;
grant execute on function public.list_region_regencies(text) to anon, authenticated;
grant execute on function public.list_region_districts(text) to anon, authenticated;
grant execute on function public.list_region_villages(text,text,integer) to anon, authenticated;
grant execute on function public.get_region_postal_code(text) to anon, authenticated;

-- Private identity-photo bucket; a draft token is the only candidate-side owner.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-identity',
  'candidate-identity',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create or replace function public.can_access_candidate_ktp_file(p_object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    p_object_name ~ '^candidate-identity/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ktp[.]jpg$'
    and exists (
      select 1
      from public.candidate_drafts d
      where d.draft_token::text = split_part(p_object_name, '/', 2)
        and not exists (
          select 1 from public.applicants a where a.access_token = d.draft_token
        )
    ),
    false
  );
$$;
revoke all on function public.can_access_candidate_ktp_file(text) from public;
grant execute on function public.can_access_candidate_ktp_file(text) to anon, authenticated;

drop policy if exists "candidate uploads own KTP" on storage.objects;
create policy "candidate uploads own KTP" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'candidate-identity'
    and public.can_access_candidate_ktp_file(name)
  );

drop policy if exists "candidate reads own draft KTP" on storage.objects;
create policy "candidate reads own draft KTP" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'candidate-identity'
    and public.can_access_candidate_ktp_file(name)
  );

drop policy if exists "candidate replaces own draft KTP" on storage.objects;
create policy "candidate replaces own draft KTP" on storage.objects
  for update to anon, authenticated
  using (
    bucket_id = 'candidate-identity'
    and public.can_access_candidate_ktp_file(name)
  )
  with check (
    bucket_id = 'candidate-identity'
    and public.can_access_candidate_ktp_file(name)
  );

drop policy if exists "portal admin reads candidate KTP" on storage.objects;
create policy "portal admin reads candidate KTP" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'candidate-identity'
    and public.is_portal_admin()
  );

-- Keep the original RPC signature for the frontend, but verify both private files
-- and persist the KTP object path separately for HR review.
create or replace function public.submit_candidate_application(
  p_access_token uuid,
  p_data jsonb,
  p_cv_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_nik text;
  v_position text;
  v_ktp_path text;
begin
  if p_access_token is null then raise exception 'Sesi lamaran tidak valid.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Data lamaran tidak valid.'; end if;

  v_name := nullif(trim(p_data->>'nama'), '');
  v_nik := regexp_replace(coalesce(p_data->>'nik',''), '\D', '', 'g');
  v_position := coalesce(p_data->>'posisi','');
  v_ktp_path := p_data->>'ktp_path';

  if v_name is null then raise exception 'Nama lengkap wajib diisi.'; end if;
  if length(v_nik) <> 16 then raise exception 'NIK harus terdiri dari 16 angka.'; end if;

  if p_cv_path is null
     or p_cv_path <> 'candidate-cv/' || p_access_token::text || '/cv.pdf'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'candidate-files' and o.name = p_cv_path
     ) then
    raise exception 'CV belum tersimpan atau lokasi file tidak valid.';
  end if;

  if v_ktp_path is null
     or v_ktp_path <> 'candidate-identity/' || p_access_token::text || '/ktp.jpg'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'candidate-identity' and o.name = v_ktp_path
     ) then
    raise exception 'Foto KTP wajib diunggah dan tersimpan sebelum lamaran dikirim.';
  end if;

  insert into public.applicants(
    access_token, full_name, nik, position, stage, application_data, cv_path, ktp_path
  )
  values (
    p_access_token, v_name, v_nik, v_position,
    'application_submitted', p_data, p_cv_path, v_ktp_path
  )
  returning id into v_id;

  delete from public.candidate_drafts where draft_token = p_access_token;
  return jsonb_build_object(
    'application_id', v_id,
    'full_name', v_name,
    'stage', 'application_submitted'
  );
exception when unique_violation then
  raise exception 'Lamaran dengan sesi ini sudah pernah dikirim.';
end;
$$;

revoke all on function public.submit_candidate_application(uuid,jsonb,text) from public;
grant execute on function public.submit_candidate_application(uuid,jsonb,text) to anon, authenticated;
