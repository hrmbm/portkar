import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('migrasi HR membatasi template master dengan RLS admin', async () => {
  const sql = await read('supabase/SETUP-ALL-IN-ONE.sql');
  assert.match(sql, /create table if not exists public\.print_templates/i);
  assert.match(sql, /alter table public\.print_templates enable row level security/i);
  assert.match(sql, /public\.is_portal_admin\(\)/i);
  assert.match(sql, /create unique index if not exists print_templates_one_active_idx/i);
  assert.match(sql, /function public\.activate_print_template/i);
});

test('konversi karyawan hanya menerima kandidat setelah DISC dan mengubah status secara atomik', async () => {
  const sql = await read('supabase/SETUP-ALL-IN-ONE.sql');
  assert.match(sql, /function public\.convert_applicant_to_employee/i);
  assert.match(sql, /v_stage not in \('disc_completed','stage4_pending'\)/i);
  assert.match(sql, /insert into public\.employees/i);
  assert.match(sql, /update public\.applicants set stage = 'hired'/i);
  assert.match(sql, /exception when unique_violation/i);
});

test('master bawaan punya form dan field stabil untuk renderer cetak', async () => {
  const html = await read('templates/application-master.html');
  assert.match(html, /id="applicationForm"/);
  for (const field of ['nama', 'nik', 'posisi', 'tanggal_lahir', 'kerja1_perusahaan', 'setuju', 'nama_terang']) {
    assert.match(html, new RegExp(`name="${field}"`), `field ${field} harus tetap tersedia`);
  }
});

test('renderer mencetak CV sebelum hasil DISC dan membaca master aktif dari Supabase', async () => {
  const js = await read('assets/js/print.js');
  assert.ok(js.indexOf('const cvSection =') < js.indexOf('let discSection ='));
  assert.match(js, /from\('print_templates'\)/);
  assert.match(js, /fillMaster\(doc, record\.application_data \|\| \{\}, record\)/);
});
