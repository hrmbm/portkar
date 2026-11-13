import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('form kandidat memakai wizard mobile dan alur kamera KTP',async()=>{
  const js=await read('assets/js/applicant.js');
  const css=await read('assets/css/app.css');
  const page=await read('form/index.html');
  assert.match(js,/getUserMedia/);
  assert.match(js,/Pindai KTP/);
  assert.match(js,/capture="environment"/);
  assert.match(js,/cameraCropCanvas/);
  assert.match(css,/aspect-ratio:1\.586/);
  assert.match(page,/tesseract\.js/);
  assert.match(js,/data-form-step/);
});

test('KTP photo is stored privately and all OCR inference runs in the browser with a 3-attempt manual fallback',async()=>{
  const js=await read('assets/js/applicant.js');
  const migration=await read('supabase/migrations/20261113122500_form_ocr_regions.sql');
  const edge=await read('supabase/functions/ktp-ocr/index.ts');
  const config=await read('assets/js/config.js');
  assert.match(js,/saveKtpPhoto/);
  assert.match(js,/KTP_PATH_PREFIX/);
  assert.match(js,/supabase\.storage\.from\(KTP_BUCKET\)\.upload/);
  assert.match(config,/candidate-identity/);
  assert.match(js,/MAX_OCR_ATTEMPTS = 3/);
  assert.match(js,/ocrAttempts\+=1/);
  assert.match(js,/ocrAttempts>=MAX_OCR_ATTEMPTS/);
  assert.match(js,/Isi data manual \(foto KTP tetap tersimpan\)/);
  assert.match(js,/Tesseract\?\.createWorker/);
  assert.match(js,/instance\.recognize\(canvas\)/);
  assert.match(js,/const terminateWorker=async/);
  assert.match(js,/await worker\.terminate\(\)/);
  assert.doesNotMatch(js,/requestServerOcr|normalizeOcrServiceResponse|functions\/v1\/ktp-ocr|KTP_OCR_API_URL/);
  assert.match(migration,/candidate-identity/);
  assert.match(migration,/public\.can_access_candidate_ktp_file/);
  assert.match(migration,/ktp_path/);
  assert.match(edge,/status: 410/);
  assert.doesNotMatch(edge,/KTP_OCR_API_URL|KTP_OCR_API_KEY|fetch\(/);
});
test('region dropdowns use persistent bounded cache, stale-response guards, and postal lookup from village rows',async()=>{
  const js=await read('assets/js/applicant.js');
  const baseMigration=await read('supabase/migrations/20261113122500_form_ocr_regions.sql');
  const postalMigration=await read('supabase/migrations/20261113083245_region_village_postal_lookup.sql');
  assert.doesNotMatch(js,/provinceChoices/);
  for(const fn of ['list_region_provinces','list_region_regencies','list_region_districts']){
    assert.match(js,new RegExp(fn));
    assert.match(baseMigration,new RegExp('function public\\.'+fn,'i'));
  }
  assert.match(js,/list_region_villages_with_postal_code/);
  assert.match(postalMigration,/returns table\(id text, name text, area_type text, postal_code text\)/i);
  assert.match(postalMigration,/v\.postal_code/);
  assert.match(js,/indexedDB\.open\(REGION_CACHE_DB,1\)/);
  assert.match(js,/REGION_CACHE_TTL_MS/);
  assert.match(js,/REGION_CACHE_VERSION/);
  assert.match(js,/REGION_CACHE_MAX_ENTRIES = 100/);
  assert.match(js,/regionInflight/);
  assert.match(js,/regionFormGeneration/);
  assert.match(js,/isCurrentRegionGeneration/);
  assert.match(js,/data-postal-code/);
  assert.match(js,/option\.dataset\.postalCode/);
  assert.doesNotMatch(js,/get_region_postal_code/);
  assert.match(js,/p_limit:30/);
  assert.match(js,/alamat_provinsi_id/);
  assert.match(js,/alamat_kodepos/);
  assert.match(baseMigration,/regions_villages_district_idx/);
  assert.match(baseMigration,/regions_villages_postal_idx/);
});

test('revised family, education, foreign-language, work, and emergency-contact fields are present',async()=>{
  const js=await read('assets/js/applicant.js');
  const duration=await read('supabase/migrations/20261113124500_experience_duration.sql');
  assert.match(js,/ayah_umur.*pattern:/);
  assert.match(js,/ibu_umur.*pattern:/);
  assert.match(js,/0 \/ - jika meninggal/);
  assert.match(js,/Jumlah saudara kandung selain Anda/);
  assert.match(js,/value:'3\+',label:'3 atau lebih'/);
  assert.match(js,/const n=i\+2,p=/);
  assert.match(js,/siblingCountValue/);
  assert.match(js,/Status Perkawinan Anda/);
  assert.match(js,/pendidikan_terakhir/);
  assert.match(js,/data-education-row/);
  assert.match(js,/D1:4,D2:5,D3:6,D4:7,S1:8/);
  assert.match(js,/Inggris.*Mandarin.*Arab.*Jepang.*Rusia.*Jerman.*Prancis.*Latin.*Lainnya/);
  assert.ok(js.includes('<strong>KEMAMPUAN BAHASA (SELAIN BAHASA INDONESIA)</strong>'));
  assert.match(js,/kontak_darurat_nama/);
  assert.match(js,/kontak_darurat_telepon/);
  assert.doesNotMatch(js,/Jumlah referensi|referensi1_nama|referensi2_nama/);
  assert.match(js,/mulai_bulan/);
  assert.match(js,/mulai_tahun/);
  assert.match(js,/selesai_bulan/);
  assert.match(js,/selesai_tahun/);
  assert.doesNotMatch(js,/\['durasi','Durasi/);
  assert.match(duration,/kerja' \|\| v_index \|\| '_durasi/);
  assert.match(duration,/extract\(month from current_date\)/);
});

test('after successful application the candidate can choose DISC now or later',async()=>{
  const js=await read('assets/js/applicant.js');
  assert.match(js,/Lamaran berhasil dikirim/);
  assert.match(js,/Lanjutkan Test DISC Sekarang/);
  assert.match(js,/Test DISC Nanti/);
  assert.match(js,/stageUrl\(3\)/);
});

test('draft persistence and clean candidate URL remain compatible',async()=>{
  const js=await read('assets/js/applicant.js');
  const common=await read('assets/js/common.js');
  const sql=await read('supabase/SETUP-ALL-IN-ONE.sql');
  assert.match(js,/save_candidate_draft/);
  assert.match(js,/get_candidate_draft/);
  assert.match(js,/localStorage|candidateToken/);
  assert.match(js,/LOCAL_DRAFT_PREFIX/);
  assert.match(js,/writeLocalDraft/);
  assert.match(common,/portal_candidate_session/);
  assert.match(common,/candidateRoutes = \{1:'apply\/',2:'form\/',3:'disc\/',4:'spm\/'\}/);
  assert.match(common,/replaceState/);
  assert.doesNotMatch(common,/searchParams\.set\('k'/);
  assert.match(sql,/create table if not exists public\.candidate_drafts/i);
  assert.match(sql,/create or replace function public\.save_candidate_draft/i);
  assert.match(sql,/delete from public\.candidate_drafts where draft_token=p_access_token/i);
});

test('address normalization still supports KTP OCR output',async()=>{
  const ocr=await read('assets/js/ktp-ocr.js');
  assert.match(ocr,/DSN/);
  assert.match(ocr,/padStart\(3,'0'\)/);
  assert.match(ocr,/alamat_tipe/);
  assert.match(ocr,/Desa\/Kel\./);
});

test('all candidate legacy routes remain available',async()=>{
  for(const path of ['apply/index.html','form/index.html','disc/index.html','spm/index.html'])
    assert.match(await read(path),/PORTAL KARIR/);
  assert.match(await read('tahap-2/index.html'),/\.\.\/form\//);
  assert.match(await read('tahap-3/index.html'),/\.\.\/disc\//);
});
