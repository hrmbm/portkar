import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('form mobile memakai wizard, kamera dengan bingkai rasio KTP dan bukan upload sebagai alur utama',async()=>{
  const js=await read('assets/js/applicant.js');
  const css=await read('assets/css/app.css');
  const page=await read('form/index.html');
  assert.match(js,/getUserMedia/);
  assert.match(js,/Pindai KTP/);
  assert.match(js,/capture=\"environment\"|capture=\'environment\'/);
  assert.match(js,/ktp-guide/);
  assert.match(js,/cameraCropCanvas/);
  assert.match(css,/aspect-ratio:1\.586/);
  assert.match(page,/tesseract\.js/);
  assert.match(js,/data-form-step/);
});

test('draf disimpan di backend dengan token persisten dan URL bersih',async()=>{
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

test('gaji memiliki format IDR dan pertanyaan kondisional memakai jumlah, bukan konfirmasi ya/tidak',async()=>{
  const js=await read('assets/js/applicant.js');
  assert.match(js,/formatCurrency/);
  assert.match(js,/data-format-number=\"idr\"/);
  assert.match(js,/alamat_tipe/);
  assert.match(js,/provinceChoices/);
  assert.match(js,/sanitizeFinalData/);
  assert.match(js,/data-format-number="idr"/);
  assert.match(js,/Jumlah anak/);
  assert.match(js,/Jumlah pengalaman kerja/);
  assert.match(js,/Jumlah referensi/);
  assert.doesNotMatch(js,/Pernah bekerja sebelumnya\?|Memiliki anak\?|Memiliki referensi\?/);
  assert.doesNotMatch(js,/window\.confirm\(/);
});

test('empat alamat kandidat tersedia pada path baru dengan redirect kompatibilitas',async()=>{
  for(const path of ['apply/index.html','form/index.html','disc/index.html','spm/index.html'])
    assert.match(await read(path),/PORTAL KARIR/);
  assert.match(await read('tahap-2/index.html'),/\.\.\/form\//);
  assert.match(await read('tahap-3/index.html'),/\.\.\/disc\//);
});


test('KTP address is standardized from the supplied KTP label patterns',async()=>{
  const ocr=await read('assets/js/ktp-ocr.js');
  assert.match(ocr,/DSN/);
  assert.match(ocr,/padStart\(3,'0'\)/);
  assert.match(ocr,/alamat_tipe/);
  assert.match(ocr,/padStart\(3,'0'\)/);
  assert.match(ocr,/Desa\/Kel\./);
});

test('pemulihan draft tetap berjalan saat Supabase offline atau belum dikonfigurasi',async()=>{
  const js=await read('assets/js/applicant.js');
  assert.match(js,/Local storage is the immediate recovery layer/);
  assert.match(js,/if\(!isConfigured \|\| remoteError\) saveState/);
  assert.match(js,/const localDraft=readLocalDraft\(draftToken\)/);
});

test('format gaji tetap aktif setelah kelompok pengalaman kerja dirender ulang',async()=>{
  const js=await read('assets/js/applicant.js');
  const group=js.slice(js.indexOf('const workHost='),js.indexOf('const refsHost='));
  assert.match(group,/currency:type==='currency'/);
  assert.match(group,/type:type==='number'\?'number':undefined/);
});
