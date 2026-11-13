-- Server-calculated employment duration and stronger final submit checks.

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
  v_data jsonb := p_data;
  v_index integer;
  v_start_month integer;
  v_start_year integer;
  v_end_month integer;
  v_end_year integer;
  v_duration integer;
  v_current boolean;
  v_months text[] := array[
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'
  ];
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

  -- Durasi dihitung di server (bulan inklusif), bukan diketik kandidat.
  for v_index in 1..3 loop
    v_start_month := array_position(v_months, v_data->>('kerja' || v_index || '_mulai_bulan'));
    v_start_year := nullif(v_data->>('kerja' || v_index || '_mulai_tahun'), '')::integer;
    v_current := lower(coalesce(v_data->>('kerja' || v_index || '_masih_bekerja'),'false')) in ('true','1','yes');

    if v_current then
      v_end_month := extract(month from current_date)::integer;
      v_end_year := extract(year from current_date)::integer;
      v_data := jsonb_set(v_data, array['kerja' || v_index || '_selesai_bulan'], to_jsonb(v_months[v_end_month]), true);
      v_data := jsonb_set(v_data, array['kerja' || v_index || '_selesai_tahun'], to_jsonb(v_end_year::text), true);
    else
      v_end_month := array_position(v_months, v_data->>('kerja' || v_index || '_selesai_bulan'));
      v_end_year := nullif(v_data->>('kerja' || v_index || '_selesai_tahun'), '')::integer;
    end if;

    if v_start_month is not null and v_start_year is not null
       and v_end_month is not null and v_end_year is not null then
      v_duration := (v_end_year - v_start_year) * 12 + (v_end_month - v_start_month) + 1;
      if v_duration < 1 then raise exception 'Periode pengalaman kerja ke-% harus berakhir setelah tanggal mulai.', v_index; end if;
      v_data := jsonb_set(v_data, array['kerja' || v_index || '_durasi'], to_jsonb(v_duration), true);
    end if;
  end loop;

  insert into public.applicants(
    access_token, full_name, nik, position, stage, application_data, cv_path, ktp_path
  )
  values (
    p_access_token, v_name, v_nik, v_position,
    'application_submitted', v_data, p_cv_path, v_ktp_path
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
