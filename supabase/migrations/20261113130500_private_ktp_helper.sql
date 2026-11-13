-- Keep the KTP storage ownership helper outside the exposed public Data API schema.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.can_access_candidate_ktp_file(p_object_name text)
returns boolean
language sql
stable
security definer
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

revoke all on function private.can_access_candidate_ktp_file(text) from public;
grant execute on function private.can_access_candidate_ktp_file(text) to anon, authenticated;

drop policy if exists "candidate uploads own KTP" on storage.objects;
create policy "candidate uploads own KTP" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'candidate-identity'
    and private.can_access_candidate_ktp_file(name)
  );

drop policy if exists "candidate reads own draft KTP" on storage.objects;
create policy "candidate reads own draft KTP" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'candidate-identity'
    and private.can_access_candidate_ktp_file(name)
  );

drop policy if exists "candidate replaces own draft KTP" on storage.objects;
create policy "candidate replaces own draft KTP" on storage.objects
  for update to anon, authenticated
  using (
    bucket_id = 'candidate-identity'
    and private.can_access_candidate_ktp_file(name)
  )
  with check (
    bucket_id = 'candidate-identity'
    and private.can_access_candidate_ktp_file(name)
  );

revoke all on function public.can_access_candidate_ktp_file(text) from public, anon, authenticated;
drop function public.can_access_candidate_ktp_file(text);
