-- ============================================================================
-- PORTAL KARIR v1.0.0 — SETUP SUPABASE LENGKAP (TANPA TERMINAL)
-- Jalankan file ini SATU KALI pada project Supabase BARU lewat SQL Editor.
-- Sebelum klik Run, ganti v_pin di bagian ADMIN PERTAMA menjadi 4–12 digit.
-- Username Admin otomatis dinormalisasi menjadi admin (huruf kecil).
-- Skrip mencakup: admin, kandidat, draft, CV Storage, DISC, karyawan, master cetak.
-- ============================================================================

begin;
-- PORTAL KARIR · Supabase schema
-- Jalankan sekali di Supabase SQL Editor.
-- Bucket privat untuk CV dibuat di bawah melalui SQL storage.buckets.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'HR Admin',
  role text not null default 'admin' check (role in ('admin','hr')),
  created_at timestamptz not null default now()
);

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  access_token uuid not null unique,
  full_name text not null,
  nik text not null,
  position text not null default '',
  stage text not null default 'application_submitted'
    check (stage in ('stage1_pending','application_submitted','disc_completed','stage4_pending','hired','rejected')),
  application_data jsonb not null default '{}'::jsonb,
  cv_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applicants_stage_created_idx on public.applicants(stage, created_at desc);
create index if not exists applicants_nik_idx on public.applicants(nik);

create table if not exists public.disc_submissions (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null unique references public.applicants(id) on delete cascade,
  answers jsonb not null,
  completed_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid unique references public.applicants(id) on delete set null,
  employee_no text not null unique,
  department text not null default '',
  position text not null default '',
  employment_status text not null default 'Aktif'
    check (employment_status in ('Aktif','Probation','Kontrak','Tetap','Nonaktif')),
  join_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_portal_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid()
  );
$$;

alter table public.admin_users enable row level security;
alter table public.applicants enable row level security;
alter table public.disc_submissions enable row level security;
alter table public.employees enable row level security;

drop policy if exists "portal admin manages admin users" on public.admin_users;
create policy "portal admin manages admin users" on public.admin_users
  for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

drop policy if exists "portal admin manages applicants" on public.applicants;
create policy "portal admin manages applicants" on public.applicants
  for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

drop policy if exists "portal admin manages disc submissions" on public.disc_submissions;
create policy "portal admin manages disc submissions" on public.disc_submissions
  for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

drop policy if exists "portal admin manages employees" on public.employees;
create policy "portal admin manages employees" on public.employees
  for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.admin_users, public.applicants, public.disc_submissions, public.employees to authenticated;
grant execute on function public.is_portal_admin() to authenticated;

-- Kandidat membuat lamaran lewat RPC, bukan akses langsung ke tabel.
create or replace function public.submit_candidate_application(
  p_access_token uuid,
  p_data jsonb,
  p_cv_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_nik text;
  v_position text;
begin
  if p_access_token is null then raise exception 'Token lamaran tidak valid.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Data lamaran tidak valid.'; end if;
  v_name := nullif(trim(p_data->>'nama'), '');
  v_nik := regexp_replace(coalesce(p_data->>'nik',''), '\D', '', 'g');
  v_position := coalesce(p_data->>'posisi','');
  if v_name is null then raise exception 'Nama lengkap wajib diisi.'; end if;
  if length(v_nik) <> 16 then raise exception 'Nomor KTP harus terdiri dari 16 angka.'; end if;
  if p_cv_path is null or p_cv_path <> 'candidate-cv/' || p_access_token::text || '/cv.pdf' then
    raise exception 'Lokasi file CV tidak valid.';
  end if;
  insert into public.applicants(access_token, full_name, nik, position, stage, application_data, cv_path)
  values (p_access_token, v_name, v_nik, v_position, 'application_submitted', p_data, p_cv_path)
  returning id into v_id;
  return jsonb_build_object('application_id',v_id,'full_name',v_name,'stage','application_submitted');
exception when unique_violation then
  raise exception 'Lamaran dengan token ini sudah pernah dikirim.';
end;
$$;

-- Token UUID bertindak sebagai tautan privat kandidat; hanya data kandidat sendiri yang dikembalikan.
create or replace function public.get_candidate_context(p_access_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'application_id', a.id,
    'full_name', a.full_name,
    'stage', a.stage,
    'disc_completed', exists(select 1 from public.disc_submissions d where d.applicant_id = a.id)
  )
  from public.applicants a
  where a.access_token = p_access_token;
$$;

-- Satu jawaban untuk setiap nomor, 0..3, MOST dan LEAST wajib berbeda.
create or replace function public.submit_disc_answers(p_access_token uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applicant_id uuid;
  v_count integer;
  v_answer jsonb;
  v_most integer;
  v_least integer;
begin
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> 24 then
    raise exception 'Tes DISC harus berisi 24 jawaban.';
  end if;
  select id into v_applicant_id from public.applicants
    where access_token = p_access_token and stage in ('application_submitted','disc_completed');
  if v_applicant_id is null then raise exception 'Tautan kandidat tidak ditemukan.'; end if;
  if exists(select 1 from public.disc_submissions where applicant_id = v_applicant_id) then
    raise exception 'Tes DISC sudah pernah diselesaikan.';
  end if;
  for v_answer in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(v_answer) <> 'object' then
      raise exception 'Format jawaban DISC tidak valid.';
    end if;
    v_most := nullif(v_answer->>'most', '')::integer;
    v_least := nullif(v_answer->>'least', '')::integer;
    if v_most is null or v_least is null
       or v_most not between 0 and 3
       or v_least not between 0 and 3
       or v_most = v_least then
      raise exception 'Pilihan MOST/LEAST tidak valid.';
    end if;
  end loop;
  insert into public.disc_submissions(applicant_id, answers) values(v_applicant_id,p_answers);
  update public.applicants set stage='disc_completed', updated_at=now() where id=v_applicant_id;
  return jsonb_build_object('ok',true,'stage','disc_completed');
end;
$$;

revoke all on function public.submit_candidate_application(uuid,jsonb,text) from public;
revoke all on function public.get_candidate_context(uuid) from public;
revoke all on function public.submit_disc_answers(uuid,jsonb) from public;
grant execute on function public.submit_candidate_application(uuid,jsonb,text) to anon, authenticated;
grant execute on function public.get_candidate_context(uuid) to anon, authenticated;
grant execute on function public.submit_disc_answers(uuid,jsonb) to anon, authenticated;

-- Storage privat untuk CV. Batasi ukuran dan format file pada bucket.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-files','candidate-files',false,10485760,array['application/pdf'])
on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=array['application/pdf'];

drop policy if exists "candidate upload CV" on storage.objects;
create policy "candidate upload CV" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id='candidate-files'
    and name ~ '^candidate-cv/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cv[.]pdf$'
  );

drop policy if exists "portal admin reads CV" on storage.objects;
create policy "portal admin reads CV" on storage.objects
  for select to authenticated
  using (bucket_id='candidate-files' and public.is_portal_admin());

drop policy if exists "portal admin deletes CV" on storage.objects;
create policy "portal admin deletes CV" on storage.objects
  for delete to authenticated
  using (bucket_id='candidate-files' and public.is_portal_admin());

-- Provisioning dashboard username + PIN terbaru ada di supabase/admin-pin-login.sql.
-- Blok di atas merupakan prosedur manual lama dan tidak diperlukan untuk setup baru.

-- ============================================================================
-- TAHAP 2 MOBILE: DRAFT PERSISTEN, CV DRAFT, DAN FINAL SUBMIT
-- ============================================================================

-- PORTAL KARIR v0.4 · Mobile Stage 2
-- Jalankan SEKALI setelah schema.sql dan stage3-hr.sql.
-- Menyimpan draf secara privat di Supabase, mendukung CV draft, dan menghilangkan token dari URL.

create table if not exists public.candidate_drafts (
  draft_token uuid primary key,
  draft_data jsonb not null default '{}'::jsonb,
  cv_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_drafts enable row level security;
revoke all on public.candidate_drafts from public, anon, authenticated;

create or replace function public.save_candidate_draft(
  p_access_token uuid,
  p_data jsonb,
  p_cv_filename text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_access_token is null then raise exception 'Sesi formulir tidak valid.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Data formulir tidak valid.'; end if;
  if octet_length(p_data::text) > 262144 then raise exception 'Ukuran draf terlalu besar.'; end if;
  if exists(select 1 from public.applicants where access_token=p_access_token) then
    raise exception 'Lamaran dengan sesi ini sudah dikirim.';
  end if;
  insert into public.candidate_drafts(draft_token,draft_data,cv_filename,updated_at)
  values(p_access_token,p_data,nullif(p_cv_filename,''),now())
  on conflict(draft_token) do update
    set draft_data=excluded.draft_data,
        cv_filename=coalesce(excluded.cv_filename,public.candidate_drafts.cv_filename),
        updated_at=now();
  return jsonb_build_object('ok',true,'updated_at',now());
end;
$$;

create or replace function public.get_candidate_draft(p_access_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'draft_data',d.draft_data,
    'cv_filename',d.cv_filename,
    'updated_at',d.updated_at
  )
  from public.candidate_drafts d
  where d.draft_token=p_access_token
    and not exists(select 1 from public.applicants a where a.access_token=d.draft_token);
$$;

create or replace function public.can_access_candidate_draft_file(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_object_name ~ '^candidate-cv/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/cv[.]pdf$'
    and exists(
      select 1 from public.candidate_drafts d
      where d.draft_token::text=split_part(p_object_name,'/',2)
        and not exists(select 1 from public.applicants a where a.access_token=d.draft_token)
    ),false
  );
$$;

revoke all on function public.save_candidate_draft(uuid,jsonb,text) from public;
revoke all on function public.get_candidate_draft(uuid) from public;
-- Fungsi ini digunakan oleh policy Storage untuk memeriksa objek draf.
revoke all on function public.can_access_candidate_draft_file(text) from public;
grant execute on function public.save_candidate_draft(uuid,jsonb,text) to anon, authenticated;
grant execute on function public.get_candidate_draft(uuid) to anon, authenticated;
grant execute on function public.can_access_candidate_draft_file(text) to anon, authenticated;

-- CV boleh dibaca/diganti hanya selama token masih berstatus draf.
drop policy if exists "candidate draft reads own CV" on storage.objects;
create policy "candidate draft reads own CV" on storage.objects
  for select to anon, authenticated
  using(bucket_id='candidate-files' and public.can_access_candidate_draft_file(name));

drop policy if exists "candidate draft replaces own CV" on storage.objects;
create policy "candidate draft replaces own CV" on storage.objects
  for update to anon, authenticated
  using(bucket_id='candidate-files' and public.can_access_candidate_draft_file(name))
  with check(bucket_id='candidate-files' and public.can_access_candidate_draft_file(name));

-- Pengiriman final memakai token draft yang sama, sehingga URL /disc/ tidak perlu membawa token.
create or replace function public.submit_candidate_application(
  p_access_token uuid,
  p_data jsonb,
  p_cv_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_nik text;
  v_position text;
begin
  if p_access_token is null then raise exception 'Sesi lamaran tidak valid.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Data lamaran tidak valid.'; end if;
  v_name := nullif(trim(p_data->>'nama'), '');
  v_nik := regexp_replace(coalesce(p_data->>'nik',''), '\D', '', 'g');
  v_position := coalesce(p_data->>'posisi','');
  if v_name is null then raise exception 'Nama lengkap wajib diisi.'; end if;
  if length(v_nik) <> 16 then raise exception 'NIK harus terdiri dari 16 angka.'; end if;
  if p_cv_path is null or p_cv_path <> 'candidate-cv/' || p_access_token::text || '/cv.pdf' then
    raise exception 'Lokasi file CV tidak valid.';
  end if;
  insert into public.applicants(access_token,full_name,nik,position,stage,application_data,cv_path)
  values(p_access_token,v_name,v_nik,v_position,'application_submitted',p_data,p_cv_path)
  returning id into v_id;
  delete from public.candidate_drafts where draft_token=p_access_token;
  return jsonb_build_object('application_id',v_id,'full_name',v_name,'stage','application_submitted');
exception when unique_violation then
  raise exception 'Lamaran dengan sesi ini sudah pernah dikirim.';
end;
$$;

revoke all on function public.submit_candidate_application(uuid,jsonb,text) from public;
grant execute on function public.submit_candidate_application(uuid,jsonb,text) to anon, authenticated;

-- Upload CV hanya diizinkan untuk token yang benar-benar memiliki draft.
drop policy if exists "candidate upload CV" on storage.objects;
create policy "candidate upload CV" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id='candidate-files' and public.can_access_candidate_draft_file(name));


-- ============================================================================
-- TAHAP 3 HR: MASTER HTML VERSI DAN KONVERSI KARYAWAN
-- ============================================================================

-- PORTAL KARIR · Tahap 3 (HR Console)
-- Jalankan setelah schema.sql dari Tahap 1.

create table if not exists public.print_templates (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  schema_version text not null default 'custom',
  html_content text not null,
  is_active boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint print_templates_html_size check (octet_length(html_content) <= 307200)
);
create index if not exists print_templates_created_idx
  on public.print_templates(created_at desc);
create unique index if not exists print_templates_one_active_idx
  on public.print_templates(is_active) where is_active = true;

alter table public.print_templates enable row level security;
drop policy if exists "portal admin reads print templates" on public.print_templates;
create policy "portal admin reads print templates" on public.print_templates
  for select to authenticated using (public.is_portal_admin());
drop policy if exists "portal admin uploads print templates" on public.print_templates;
create policy "portal admin uploads print templates" on public.print_templates
  for insert to authenticated with check (public.is_portal_admin() and uploaded_by = auth.uid());
drop policy if exists "portal admin updates print templates" on public.print_templates;
create policy "portal admin updates print templates" on public.print_templates
  for update to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
grant select, insert, update on public.print_templates to authenticated;

create or replace function public.activate_print_template(p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_portal_admin() then
    raise exception 'Akses admin diperlukan.';
  end if;
  if not exists (select 1 from public.print_templates where id = p_template_id) then
    raise exception 'Versi master tidak ditemukan.';
  end if;
  update public.print_templates set is_active = false where is_active = true;
  update public.print_templates set is_active = true where id = p_template_id;
  return jsonb_build_object('ok', true, 'active_template_id', p_template_id);
end;
$$;
revoke all on function public.activate_print_template(uuid) from public;
grant execute on function public.activate_print_template(uuid) to authenticated;

-- Konversi kandidat -> karyawan dilakukan atomik agar tidak ada record setengah jadi.
create or replace function public.convert_applicant_to_employee(
  p_applicant_id uuid,
  p_employee_no text,
  p_department text default '',
  p_position text default '',
  p_employment_status text default 'Aktif',
  p_join_date date default current_date,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_stage text;
begin
  if not public.is_portal_admin() then
    raise exception 'Akses admin diperlukan.';
  end if;
  if nullif(trim(p_employee_no), '') is null then
    raise exception 'Nomor karyawan wajib diisi.';
  end if;
  if p_employment_status not in ('Aktif','Probation','Kontrak','Tetap','Nonaktif') then
    raise exception 'Status karyawan tidak valid.';
  end if;
  select stage into v_stage from public.applicants where id = p_applicant_id for update;
  if v_stage is null then raise exception 'Kandidat tidak ditemukan.'; end if;
  if v_stage not in ('disc_completed','stage4_pending') then
    raise exception 'Kandidat belum menyelesaikan tahap DISC.';
  end if;
  if exists(select 1 from public.employees where applicant_id = p_applicant_id) then
    raise exception 'Kandidat sudah tercatat sebagai karyawan.';
  end if;
  insert into public.employees(
    applicant_id, employee_no, department, position, employment_status, join_date, notes
  ) values (
    p_applicant_id, trim(p_employee_no), coalesce(trim(p_department), ''),
    coalesce(trim(p_position), ''), p_employment_status, p_join_date,
    coalesce(trim(p_notes), '')
  ) returning id into v_employee_id;
  update public.applicants set stage = 'hired', updated_at = now() where id = p_applicant_id;
  return jsonb_build_object('ok', true, 'employee_id', v_employee_id);
exception when unique_violation then
  raise exception 'Nomor karyawan sudah digunakan atau kandidat sudah dikonversi.';
end;
$$;
revoke all on function public.convert_applicant_to_employee(uuid,text,text,text,text,date,text) from public;
grant execute on function public.convert_applicant_to_employee(uuid,text,text,text,text,date,text) to authenticated;

-- ============================================================================
-- PORTAL KARIR v1.0.0 — ADMIN LOGIN USERNAME + PIN (UI-ONLY)
-- Username disimpan lowercase. Input "Admin" otomatis menjadi "admin".
-- PIN disimpan sebagai bcrypt hash; PIN asli tidak tersimpan di tabel.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_login_credentials (
  username text primary key,
  pin_hash text not null,
  display_name text not null default 'HR Admin',
  role text not null default 'admin' check (role in ('admin','hr')),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Paksa format konsisten saat setup diulang. Username selalu lowercase.
alter table public.admin_login_credentials
  drop constraint if exists admin_login_username_format;
alter table public.admin_login_credentials
  add constraint admin_login_username_format check (
    username = lower(btrim(username))
    and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'
  );

alter table public.admin_login_credentials enable row level security;
revoke all on public.admin_login_credentials from public, anon, authenticated;
grant all on public.admin_login_credentials to service_role;
grant all on public.admin_users to service_role;

create or replace function public.verify_admin_pin(
  p_username text,
  p_pin text
)
returns table (
  ok boolean,
  auth_user_id uuid,
  display_name text,
  role text,
  message text,
  attempts_left integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_credential public.admin_login_credentials%rowtype;
  v_attempts integer;
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_pin text := coalesce(p_pin, '');
begin
  select * into v_credential
  from public.admin_login_credentials
  where username = v_username
  for update;

  if not found then
    return query select false, null::uuid, null::text, null::text,
      'Username atau PIN tidak sesuai.', 0;
    return;
  end if;

  if v_credential.locked_until is not null and v_credential.locked_until > now() then
    return query select false, null::uuid, null::text, null::text,
      'Login dikunci sementara. Silakan coba lagi setelah 15 menit.', 0;
    return;
  end if;

  if extensions.crypt(v_pin, v_credential.pin_hash) = v_credential.pin_hash then
    update public.admin_login_credentials
    set failed_attempts = 0,
        locked_until = null,
        last_login = now(),
        updated_at = now()
    where username = v_username;

    return query select true, v_credential.auth_user_id,
      v_credential.display_name, v_credential.role, 'OK', 5;
    return;
  end if;

  v_attempts := v_credential.failed_attempts + 1;
  update public.admin_login_credentials
  set failed_attempts = v_attempts,
      locked_until = case when v_attempts >= 5 then now() + interval '15 minutes' else null end,
      updated_at = now()
  where username = v_username;

  return query select false, null::uuid, null::text, null::text,
    case when v_attempts >= 5
      then 'Terlalu banyak percobaan. Login dikunci selama 15 menit.'
      else 'Username atau PIN tidak sesuai.'
    end,
    greatest(0, 5 - v_attempts);
end;
$$;

create or replace function public.find_admin_auth_user(p_username text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id
  from auth.users
  where lower(email) = lower(btrim(p_username) || '@portal.internal')
  order by created_at asc
  limit 1;
$$;

revoke all on function public.verify_admin_pin(text,text) from public, anon, authenticated;
revoke all on function public.find_admin_auth_user(text) from public, anon, authenticated;
grant execute on function public.verify_admin_pin(text,text) to service_role;
grant execute on function public.find_admin_auth_user(text) to service_role;

-- ============================================================================
-- BUAT ADMIN PERTAMA DI SINI
-- Cukup ganti PIN di bawah (4–12 digit). Username "Admin" akan otomatis
-- disimpan sebagai "admin". Anda juga boleh mengganti username dan nama.
-- ============================================================================
do $$
declare
  v_username text := lower(btrim('Admin'));
  v_pin text := 'GANTI_PIN_6_ANGKA';
  v_display_name text := 'Administrator';
begin
  if v_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    raise exception 'Username harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.';
  end if;
  if v_pin !~ '^[0-9]{4,12}$' then
    raise exception 'Ganti v_pin dengan PIN angka 4–12 digit sebelum menjalankan SQL.';
  end if;
  if v_display_name = 'GANTI_NAMA_TAMPILAN' then
    raise exception 'Isi nama tampilan admin terlebih dahulu.';
  end if;

  insert into public.admin_login_credentials
    (username, pin_hash, display_name, role)
  values
    (v_username, extensions.crypt(v_pin, extensions.gen_salt('bf', 12)), v_display_name, 'admin')
  on conflict (username) do update
  set pin_hash = excluded.pin_hash,
      display_name = excluded.display_name,
      role = excluded.role,
      failed_attempts = 0,
      locked_until = null,
      updated_at = now();
end;
$$;

-- Output verifikasi: username harus tampil lowercase (misalnya admin).
-- Tidak menampilkan PIN, bcrypt hash, atau secret.
select username, display_name, role, (auth_user_id is not null) as auth_sudah_terhubung
from public.admin_login_credentials
order by created_at;

commit;
