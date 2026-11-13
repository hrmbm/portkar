-- Harden the candidate storage policy helpers and region read access.
-- Public region data is exposed through RLS-backed invoker RPCs; private storage
-- helper functions live outside the PostgREST-exposed public schema.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.can_access_candidate_draft_file(p_object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    p_object_name ~ '^candidate-cv/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cv[.]pdf$'
    and exists (
      select 1 from public.candidate_drafts d
      where d.draft_token::text = split_part(p_object_name, '/', 2)
        and not exists (select 1 from public.applicants a where a.access_token = d.draft_token)
    ), false
  );
$$;

create or replace function private.can_access_candidate_ktp_file(p_object_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    p_object_name ~ '^candidate-identity/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/ktp[.]jpg$'
    and exists (
      select 1 from public.candidate_drafts d
      where d.draft_token::text = split_part(p_object_name, '/', 2)
        and not exists (select 1 from public.applicants a where a.access_token = d.draft_token)
    ), false
  );
$$;

revoke all on function private.can_access_candidate_draft_file(text) from public;
revoke all on function private.can_access_candidate_ktp_file(text) from public;
grant execute on function private.can_access_candidate_draft_file(text) to anon, authenticated;
grant execute on function private.can_access_candidate_ktp_file(text) to anon, authenticated;

drop policy if exists "candidate upload CV" on storage.objects;
create policy "candidate upload CV" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id='candidate-files' and private.can_access_candidate_draft_file(name));

drop policy if exists "candidate draft reads own CV" on storage.objects;
create policy "candidate draft reads own CV" on storage.objects
  for select to anon, authenticated
  using (bucket_id='candidate-files' and private.can_access_candidate_draft_file(name));

drop policy if exists "candidate draft replaces own CV" on storage.objects;
create policy "candidate draft replaces own CV" on storage.objects
  for update to anon, authenticated
  using (bucket_id='candidate-files' and private.can_access_candidate_draft_file(name))
  with check (bucket_id='candidate-files' and private.can_access_candidate_draft_file(name));

drop policy if exists "candidate uploads own KTP" on storage.objects;
create policy "candidate uploads own KTP" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id='candidate-identity' and private.can_access_candidate_ktp_file(name));

drop policy if exists "candidate reads own draft KTP" on storage.objects;
create policy "candidate reads own draft KTP" on storage.objects
  for select to anon, authenticated
  using (bucket_id='candidate-identity' and private.can_access_candidate_ktp_file(name));

drop policy if exists "candidate replaces own draft KTP" on storage.objects;
create policy "candidate replaces own draft KTP" on storage.objects
  for update to anon, authenticated
  using (bucket_id='candidate-identity' and private.can_access_candidate_ktp_file(name))
  with check (bucket_id='candidate-identity' and private.can_access_candidate_ktp_file(name));

revoke all on function public.can_access_candidate_draft_file(text) from public, anon, authenticated;
revoke all on function public.can_access_candidate_ktp_file(text) from public, anon, authenticated;
drop function if exists public.can_access_candidate_draft_file(text);
drop function if exists public.can_access_candidate_ktp_file(text);

drop policy if exists "public reads region provinces" on public.regions_provinces;
create policy "public reads region provinces" on public.regions_provinces
  for select to anon, authenticated using (true);
drop policy if exists "public reads region regencies" on public.regions_regencies;
create policy "public reads region regencies" on public.regions_regencies
  for select to anon, authenticated using (true);
drop policy if exists "public reads region districts" on public.regions_districts;
create policy "public reads region districts" on public.regions_districts
  for select to anon, authenticated using (true);
drop policy if exists "public reads region villages" on public.regions_villages;
create policy "public reads region villages" on public.regions_villages
  for select to anon, authenticated using (true);

grant select on public.regions_provinces, public.regions_regencies,
  public.regions_districts, public.regions_villages to anon, authenticated;

create or replace function public.list_region_provinces()
returns table(id text, name text)
language sql stable security invoker
set search_path = ''
as $$
  select p.id, p.name from public.regions_provinces p order by p.name;
$$;

create or replace function public.list_region_regencies(p_province_id text)
returns table(id text, name text)
language sql stable security invoker
set search_path = ''
as $$
  select r.id, r.name from public.regions_regencies r
  where r.province_id = p_province_id order by r.name;
$$;

create or replace function public.list_region_districts(p_regency_id text)
returns table(id text, name text)
language sql stable security invoker
set search_path = ''
as $$
  select d.id, d.name from public.regions_districts d
  where d.regency_id = p_regency_id order by d.name;
$$;

create or replace function public.list_region_villages(
  p_district_id text, p_search text default null, p_limit integer default 30
)
returns table(id text, name text, area_type text)
language sql stable security invoker
set search_path = ''
as $$
  select v.id, v.name, v.area_type from public.regions_villages v
  where v.district_id = p_district_id
    and (nullif(trim(p_search), '') is null
      or lower(v.name) like lower(left(trim(p_search), 60)) || '%')
  order by v.name
  limit greatest(1, least(coalesce(p_limit, 30), 30));
$$;

create or replace function public.get_region_postal_code(p_village_id text)
returns text
language sql stable security invoker
set search_path = ''
as $$
  select v.postal_code from public.regions_villages v where v.id = p_village_id;
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

revoke execute on function public.activate_print_template(uuid) from anon;
grant execute on function public.activate_print_template(uuid) to authenticated;
revoke execute on function public.convert_applicant_to_employee(uuid,text,text,text,text,date,text) from anon;
grant execute on function public.convert_applicant_to_employee(uuid,text,text,text,text,date,text) to authenticated;
revoke execute on function public.is_portal_admin() from anon;
grant execute on function public.is_portal_admin() to authenticated;

create index if not exists print_templates_uploaded_by_idx
  on public.print_templates(uploaded_by) where uploaded_by is not null;
drop policy if exists "portal admin uploads print templates" on public.print_templates;
create policy "portal admin uploads print templates" on public.print_templates
  for insert to authenticated
  with check (public.is_portal_admin() and uploaded_by = (select auth.uid()));
