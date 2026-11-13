import { supabase, isConfigured } from './supabase.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEMPLATE_URL } from './config.js';
import { $, $$, esc, idDate } from './common.js';
import { printApplication } from './print.js';
import { computeDisc } from './disc-engine.js';

const loginView = $('#login-view');
const shell = $('#admin-shell');
const content = $('#admin-content');
let applicants = [];
let employees = [];
let activeView = 'dashboard';
let adminDisplayName = 'HR Admin';
let currentUserId = null;
let printTemplates = [];
let editingEmployeeId = null;
let hiringApplicantId = null;

const TITLES = {
  dashboard: 'Dashboard', stage1: 'Rekrutmen Tahap 1', stage2: 'Rekrutmen Tahap 2',
  stage3: 'Rekrutmen Tahap 3', employees: 'Tracking Karyawan', print: 'Cetak Lamaran',
  reports: 'Laporan Rekrutmen'
};
const stageLabel = {
  stage1_pending: 'Tahap 1', application_submitted: 'Tahap 2', disc_completed: 'Tahap 3',
  stage4_pending: 'Tahap 4', hired: 'Karyawan', rejected: 'Tidak dilanjutkan'
};
const stageClass = {
  stage1_pending: 'gray', application_submitted: 'blue', disc_completed: 'green',
  stage4_pending: 'gold', hired: 'green', rejected: 'gray'
};

function say(message) {
  let element = $('#admin-toast');
  if (!element) {
    element = document.createElement('div');
    element.id = 'admin-toast';
    element.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:1000;padding:12px 16px;background:#17243a;color:#fff;border-radius:10px;font:12px DM Sans;box-shadow:0 8px 25px #17243a30;max-width:min(480px,calc(100vw - 32px))';
    document.body.append(element);
  }
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(element._hideTimer);
  element._hideTimer = setTimeout(() => element.classList.add('hidden'), 3600);
}

function statusPill(stage) {
  return `<span class="status-pill ${stageClass[stage] || 'gray'}">${esc(stageLabel[stage] || stage || '—')}</span>`;
}
function fmtAge(applicant) {
  return applicant?.application_data?.umur ? `${esc(applicant.application_data.umur)} th` : '—';
}
function header(title, subtitle, actions = '') {
  return `<div class="page-intro"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="page-actions">${actions}</div></div>`;
}
function tableToolbar(placeholder = 'Cari nama / NIK…') {
  return `<div class="panel-head"><div><h3>Daftar kandidat</h3><p>Data lamaran tersimpan</p></div><div class="table-search"><input id="table-search" type="search" placeholder="${esc(placeholder)}"></div></div>`;
}
function emptyRow(columns, message = 'Belum ada data') {
  return `<tr><td colspan="${columns}" class="table-empty">${esc(message)}</td></tr>`;
}
function getEmployeeForApplicant(applicant) {
  return Array.isArray(applicant?.employees) ? applicant.employees[0] : applicant?.employees;
}
function getDiscForApplicant(applicant) {
  return Array.isArray(applicant?.disc_submissions) ? applicant.disc_submissions[0] : applicant?.disc_submissions;
}

function applicantRows(rows, action = 'print') {
  if (!rows.length) return emptyRow(action === 'both' ? 6 : 5);
  return rows.map(applicant => {
    const employee = getEmployeeForApplicant(applicant);
    const disc = getDiscForApplicant(applicant);
    let pattern = '—';
    if (disc?.answers) {
      try { pattern = computeDisc(disc.answers).pola[2].nama; }
      catch { pattern = 'Perlu diperiksa'; }
    }
    const printLabel = action === 'both' ? 'Cetak' : 'Cetak';
    return `<tr>
      <td><b>${esc(applicant.full_name)}</b><small class="table-subline">${esc(applicant.nik)}</small></td>
      <td>${esc(applicant.position || '—')}</td><td>${fmtAge(applicant)}</td><td>${statusPill(applicant.stage)}</td>
      ${action === 'both' ? `<td>${esc(pattern)}</td>` : ''}
      <td><div class="row-actions">
        ${applicant.ktp_path ? `<button class="icon-btn" data-ktp="${esc(applicant.id)}">Lihat KTP</button>` : ''}
        ${action === 'both' && !employee ? `<button class="icon-btn" data-hire="${esc(applicant.id)}">Jadikan karyawan</button>` : ''}
        <button class="icon-btn" data-print="${esc(applicant.id)}">${printLabel}</button>
      </div></td>
    </tr>`;
  }).join('');
}


function ktpViewer(){
  let modal=$('#ktp-viewer');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='ktp-viewer';
  modal.className='ktp-viewer-backdrop hidden';
  modal.innerHTML='<section class="ktp-viewer-card" role="dialog" aria-modal="true" aria-label="Foto KTP kandidat"><div class="ktp-viewer-head"><b>Verifikasi foto KTP</b><button type="button" id="ktp-viewer-close" aria-label="Tutup">×</button></div><img id="ktp-viewer-image" alt="Foto KTP kandidat"><p>URL privat akan kedaluwarsa otomatis. Jangan bagikan tautan ini kepada pihak lain.</p></section>';
  document.body.append(modal);
  const close=()=>{modal.classList.add('hidden');$('#ktp-viewer-image',modal).removeAttribute('src');};
  $('#ktp-viewer-close',modal).addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal)close();});
  return modal;
}
function bindKtp(){
  $$('[data-ktp]').forEach(button=>button.addEventListener('click',async()=>{
    const applicant=applicants.find(row=>row.id===button.dataset.ktp);
    if(!applicant?.ktp_path)return;
    const old=button.textContent;button.disabled=true;button.textContent='Membuka…';
    try{
      const {data,error}=await supabase.storage.from('candidate-identity').createSignedUrl(applicant.ktp_path,180);
      if(error)throw error;
      const modal=ktpViewer(),img=$('#ktp-viewer-image',modal);
      img.src=data.signedUrl;modal.classList.remove('hidden');
    }catch(error){say(error.message||'Foto KTP tidak dapat dibuka.');}
    finally{button.disabled=false;button.textContent=old;}
  }));
}

function bindSearch(selector, rerender) {
  const input = $(selector);
  if (!input) return;
  input.addEventListener('input', () => rerender(input.value.trim().toLocaleLowerCase('id')));
}

async function refreshData() {
  const [candidateResult, employeeResult] = await Promise.all([
    supabase.from('applicants')
      .select('id,access_token,full_name,nik,position,stage,application_data,cv_path,ktp_path,created_at,disc_submissions(id,answers,completed_at),employees(id)')
      .order('created_at', { ascending: false }).limit(1000),
    supabase.from('employees')
      .select('id,applicant_id,employee_no,department,position,employment_status,join_date,notes,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(1000)
  ]);
  if (candidateResult.error) throw candidateResult.error;
  if (employeeResult.error) throw employeeResult.error;
  applicants = candidateResult.data || [];
  employees = employeeResult.data || [];
}

function renderDashboard() {
  const total = applicants.length;
  const stage1 = applicants.filter(a => a.stage === 'stage1_pending').length;
  const stage2 = applicants.filter(a => a.stage === 'application_submitted').length;
  const stage3 = applicants.filter(a => a.stage === 'disc_completed').length;
  const stage4 = applicants.filter(a => a.stage === 'stage4_pending').length;
  const hired = employees.length;
  const rejected = applicants.filter(a => a.stage === 'rejected').length;
  const submitted = stage2 + stage3 + stage4 + hired;
  const stages = [['Tahap 1', stage1], ['Lamaran', stage2], ['DISC', stage3], ['Tahap 4', stage4], ['Karyawan', hired], ['Tidak lanjut', rejected]];
  const max = Math.max(1, ...stages.map(item => item[1]));
  const summaries = [
    ['Lamaran masuk', submitted], ['Tes DISC selesai', stage3 + stage4 + hired],
    ['Menunggu tahap 4', stage4], ['Terdaftar sebagai karyawan', hired]
  ];
  content.innerHTML = header('Dashboard', 'Ringkasan aktivitas rekrutmen') + `
    <div class="stat-grid">
      <article class="stat-card"><div class="stat-top">Total kandidat <span class="stat-icon">♙</span></div><div class="stat-number">${total}</div><div class="stat-note">Seluruh kandidat terdaftar</div></article>
      <article class="stat-card"><div class="stat-top">Lamaran masuk <span class="stat-icon">▤</span></div><div class="stat-number">${submitted}</div><div class="stat-note">Formulir telah dikirim</div></article>
      <article class="stat-card"><div class="stat-top">Tes DISC selesai <span class="stat-icon">◈</span></div><div class="stat-number">${stage3 + stage4 + hired}</div><div class="stat-note">Jawaban lengkap tersimpan</div></article>
      <article class="stat-card"><div class="stat-top">Karyawan <span class="stat-icon">⌂</span></div><div class="stat-number">${hired}</div><div class="stat-note">Dalam tracking karyawan</div></article>
    </div>
    <div class="content-grid">
      <section class="panel"><div class="panel-head"><div><h3>Alur rekrutmen</h3><p>Distribusi kandidat per tahap</p></div><span class="status-pill blue">${total} kandidat</span></div>
        <div class="panel-body"><div class="chart-bars dashboard-bars">${stages.map(([label, value]) => `<div class="bar-group"><span class="bar-value">${value}</span><div class="bar" style="height:${Math.max(4, value / max * 118)}px"></div><span class="bar-label">${esc(label)}</span></div>`).join('')}</div></div>
      </section>
      <section class="panel"><div class="panel-head"><div><h3>Ringkasan tahap</h3><p>Status data saat ini</p></div></div>
        <div class="panel-body"><div class="stage-list">${summaries.map(([label, value]) => `<div class="stage-row"><div><b>${esc(label)}</b><small>${value} data</small><div class="progress-track"><div class="progress-fill" style="width:${total ? Math.min(100, value / total * 100) : 0}%"></div></div></div><span class="stage-count">${value}</span></div>`).join('')}</div></div>
      </section>
    </div>
    <section class="panel table-panel"><div class="panel-head"><div><h3>Kandidat terbaru</h3><p>Entri paling baru</p></div><button class="btn btn-secondary" id="refresh-dashboard">Muat ulang ↻</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>KANDIDAT</th><th>POSISI</th><th>USIA</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>${applicantRows(applicants.slice(0, 7), 'print')}</tbody></table></div>
    </section>`;
  bindPrint(); bindKtp();
  $('#refresh-dashboard')?.addEventListener('click', () => loadView('dashboard'));
}

function renderStage2() {
  const rows = applicants.filter(a => ['application_submitted', 'disc_completed', 'stage4_pending', 'hired'].includes(a.stage));
  content.innerHTML = header('Rekrutmen Tahap 2', 'Formulir lamaran kandidat') + `
    <section class="panel table-panel">${tableToolbar()}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>KANDIDAT</th><th>POSISI</th><th>USIA</th><th>STATUS</th><th>AKSI</th></tr></thead>
      <tbody id="candidate-rows">${applicantRows(rows, 'print')}</tbody>
    </table></div></section>`;
  bindSearch('#table-search', query => {
    $('#candidate-rows').innerHTML = applicantRows(rows.filter(a => `${a.full_name} ${a.nik} ${a.position}`.toLocaleLowerCase('id').includes(query)), 'print');
    bindPrint(); bindKtp();
  });
  bindPrint(); bindKtp();
}

function renderStage3() {
  const rows = applicants.filter(a => getDiscForApplicant(a) || a.stage === 'disc_completed' || a.stage === 'hired');
  content.innerHTML = header('Rekrutmen Tahap 3', 'Hasil tes DISC kandidat') + `
    <section class="panel table-panel">${tableToolbar()}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>KANDIDAT</th><th>POSISI</th><th>USIA</th><th>STATUS</th><th>POLA ALAMI</th><th>AKSI</th></tr></thead>
      <tbody id="candidate-rows">${applicantRows(rows, 'both')}</tbody>
    </table></div></section>`;
  const repaint = query => {
    $('#candidate-rows').innerHTML = applicantRows(rows.filter(a => `${a.full_name} ${a.nik} ${a.position}`.toLocaleLowerCase('id').includes(query)), 'both');
    bindPrint(); bindHire(); bindKtp();
  };
  bindSearch('#table-search', repaint);
  bindPrint(); bindHire(); bindKtp();
}

function employeeRows(rows) {
  if (!rows.length) return emptyRow(7);
  return rows.map(employee => {
    const applicant = applicants.find(a => a.id === employee.applicant_id);
    return `<tr>
      <td><b>${esc(applicant?.full_name || '—')}</b><small class="table-subline">${esc(applicant?.nik || '')}</small></td>
      <td>${esc(employee.employee_no)}</td><td>${esc(employee.department || '—')}</td>
      <td>${esc(employee.position || applicant?.position || '—')}</td>
      <td><span class="status-pill ${employee.employment_status === 'Nonaktif' ? 'gray' : 'green'}">${esc(employee.employment_status)}</span></td>
      <td>${idDate(employee.join_date)}</td><td><button class="icon-btn" data-edit-employee="${esc(employee.id)}">Edit</button></td>
    </tr>`;
  }).join('');
}

function renderEmployees() {
  content.innerHTML = header('Tracking Karyawan', 'Data karyawan yang telah dipindahkan dari proses rekrutmen', '<button id="export-employees" class="btn btn-primary">Unduh XLSX ↓</button>') + `
    <section class="panel table-panel">${tableToolbar('Cari nama / nomor karyawan…')}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>NAMA KARYAWAN</th><th>NOMOR</th><th>DEPARTEMEN</th><th>POSISI</th><th>STATUS</th><th>TANGGAL MASUK</th><th>AKSI</th></tr></thead>
      <tbody id="employee-rows">${employeeRows(employees)}</tbody>
    </table></div></section>`;
  bindSearch('#table-search', query => {
    const rows = employees.filter(e => {
      const a = applicants.find(x => x.id === e.applicant_id);
      return `${a?.full_name || ''} ${a?.nik || ''} ${e.employee_no} ${e.department || ''} ${e.position || ''}`.toLocaleLowerCase('id').includes(query);
    });
    $('#employee-rows').innerHTML = employeeRows(rows);
    bindEmployeeEdit();
  });
  $('#export-employees').addEventListener('click', exportEmployees);
  bindEmployeeEdit();
}

function renderPrintRows(rows) {
  if (!rows.length) return emptyRow(5);
  return rows.map(applicant => {
    const disc = getDiscForApplicant(applicant);
    return `<tr><td><b>${esc(applicant.full_name)}</b><small class="table-subline">${esc(applicant.nik)}</small></td>
      <td>${esc(applicant.position || '—')}</td><td>${statusPill(applicant.stage)}</td>
      <td>${disc ? '<span class="status-pill green">Lengkap</span>' : '<span class="status-pill gray">Belum ada</span>'}</td>
      <td><button class="icon-btn" data-print="${esc(applicant.id)}">Cetak Lamaran · CV · DISC</button></td></tr>`;
  }).join('');
}

async function loadPrintTemplates() {
  const { data, error } = await supabase.from('print_templates')
    .select('id,source_filename,schema_version,is_active,created_at')
    .order('created_at', { ascending: false }).limit(30);
  if (error) {
    printTemplates = [];
    return error;
  }
  printTemplates = data || [];
  return null;
}

function templateManagerHtml(migrationError = null) {
  const active = printTemplates.find(t => t.is_active);
  const currentName = active?.source_filename || 'Master bawaan repository';
  const history = printTemplates.length ? printTemplates.map(template => `<tr>
    <td><b>${esc(template.source_filename)}</b><small class="table-subline">${esc(template.schema_version || '—')}</small></td>
    <td>${idDate(template.created_at)}</td>
    <td>${template.is_active ? '<span class="status-pill green">Aktif</span>' : '<span class="status-pill gray">Arsip</span>'}</td>
    <td>${template.is_active ? '' : `<button class="icon-btn" data-template-activate="${esc(template.id)}">Jadikan aktif</button>`}</td>
  </tr>`).join('') : emptyRow(4, 'Belum ada versi master tambahan. Master bawaan tetap digunakan.');
  const controls = migrationError
    ? `<div class="form-error template-error">Riwayat master belum tersedia. Jalankan <code>supabase/SETUP-ALL-IN-ONE.sql</code> di Supabase SQL Editor untuk mengaktifkan master versi.</div>`
    : `<div class="template-current"><div><small>MASTER AKTIF</small><b>${esc(currentName)}</b><span>${active ? `Diperbarui ${idDate(active.created_at)}` : 'Menggunakan file templates/application-master.html'}</span></div>
        <button class="btn btn-secondary" id="restore-template">Pulihkan master bawaan</button></div>
      <form id="template-upload-form" class="template-upload">
        <div class="template-upload-copy"><b>Ganti desain master</b><span>Unggah HTML baru. Field <code>name</code> yang lama wajib dipertahankan.</span></div>
        <input id="template-file" class="input" type="file" accept=".html,text/html" required>
        <button class="btn btn-primary" type="submit">Simpan & aktifkan</button>
      </form>
      <div class="template-history"><div class="template-history-title">Riwayat versi tersimpan</div><div class="table-wrap"><table class="data-table"><thead><tr><th>FILE MASTER</th><th>TANGGAL</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>${history}</tbody></table></div></div>`;
  return `<section class="panel template-manager">
    <div class="panel-head"><div><h3>Master HTML lamaran</h3><p>Desain dapat diganti tanpa mengubah struktur data formulir</p></div><span class="status-pill ${active ? 'green' : 'blue'}">${active ? 'Versi tersimpan' : 'Master bawaan'}</span></div>
    <div class="template-manager-body">${controls}</div>
  </section>`;
}

function renderPrint() {
  content.innerHTML = header('Cetak Lamaran', 'Dokumen disusun otomatis: Lamaran · CV · DISC') + `
    <section class="panel table-panel">${tableToolbar()}<div class="table-wrap"><table class="data-table">
      <thead><tr><th>KANDIDAT</th><th>POSISI</th><th>TAHAP</th><th>DISC</th><th>DOKUMEN</th></tr></thead>
      <tbody id="candidate-rows">${renderPrintRows(applicants)}</tbody>
    </table></div></section>
    <div id="template-manager-slot"></div>`;
  bindSearch('#table-search', query => {
    $('#candidate-rows').innerHTML = renderPrintRows(applicants.filter(a => `${a.full_name} ${a.nik} ${a.position}`.toLocaleLowerCase('id').includes(query)));
    bindPrint();
  });
  bindPrint();
  loadPrintTemplates().then(error => {
    const slot = $('#template-manager-slot');
    if (!slot) return;
    slot.innerHTML = templateManagerHtml(error);
    bindTemplateManager(Boolean(error));
  });
}

function renderPlaceholder(title, subtitle) {
  content.innerHTML = header(title, subtitle) + `<section class="panel placeholder-panel"><div><div class="placeholder-symbol">◌</div><h2>Belum tersedia</h2><p>Area ini disiapkan untuk pengembangan berikutnya.</p></div></section>`;
}

function bindPrint() {
  $$('[data-print]').forEach(button => {
    button.addEventListener('click', async () => {
      const record = applicants.find(a => a.id === button.dataset.print);
      if (!record) return;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Menyiapkan…';
      try { await printApplication(record); }
      catch (error) { say(error.message || 'Dokumen tidak dapat disiapkan.'); }
      finally { button.disabled = false; button.textContent = originalText; }
    });
  });
}

function employeeModal() {
  let modal = $('#employee-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'employee-modal';
  modal.className = 'modal-backdrop hidden';
  modal.innerHTML = `<section class="employee-modal-card" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
    <div class="employee-modal-head"><div><small>TRACKING KARYAWAN</small><h2 id="employee-modal-title">Data karyawan</h2></div><button type="button" class="modal-close" id="employee-modal-close" aria-label="Tutup">×</button></div>
    <form id="employee-form">
      <div class="employee-form-grid">
        <label>Nomor karyawan<input class="input" name="employee_no" required maxlength="40"></label>
        <label>Departemen<input class="input" name="department" maxlength="120"></label>
        <label>Posisi<input class="input" name="position" maxlength="120"></label>
        <label>Status<select class="select" name="employment_status"><option>Aktif</option><option>Probation</option><option>Kontrak</option><option>Tetap</option><option>Nonaktif</option></select></label>
        <label>Tanggal masuk<input class="input" type="date" name="join_date"></label>
        <label class="employee-notes">Catatan<textarea class="textarea" name="notes" rows="3" maxlength="2000"></textarea></label>
      </div>
      <div class="employee-modal-actions"><button type="button" class="btn btn-secondary" id="employee-cancel">Batal</button><button type="submit" class="btn btn-primary" id="employee-save">Simpan data</button></div>
      <div id="employee-form-error" class="form-error" role="alert"></div>
    </form>
  </section>`;
  document.body.append(modal);
  const close = () => { modal.classList.add('hidden'); editingEmployeeId = null; hiringApplicantId = null; };
  $('#employee-modal-close', modal).addEventListener('click', close);
  $('#employee-cancel', modal).addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  $('#employee-form', modal).addEventListener('submit', saveEmployee);
  return modal;
}

function openEmployeeModal(employee = null, applicant = null) {
  const modal = employeeModal();
  const form = $('#employee-form', modal);
  form.reset();
  editingEmployeeId = employee?.id || null;
  hiringApplicantId = applicant?.id || null;
  const generatedNo = `EMP-${new Date().getFullYear()}-${(applicant?.id || crypto.randomUUID()).slice(0, 8).toUpperCase()}`;
  form.elements.employee_no.value = employee?.employee_no || generatedNo;
  form.elements.department.value = employee?.department || '';
  form.elements.position.value = employee?.position || applicant?.position || '';
  form.elements.employment_status.value = employee?.employment_status || 'Aktif';
  form.elements.join_date.value = employee?.join_date || new Date().toISOString().slice(0, 10);
  form.elements.notes.value = employee?.notes || '';
  $('#employee-modal-title', modal).textContent = employee ? 'Ubah data karyawan' : `Konversi ${applicant?.full_name || 'kandidat'}`;
  $('#employee-form-error', modal).textContent = '';
  modal.classList.remove('hidden');
  form.elements.employee_no.focus();
}

async function saveEmployee(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const saveButton = $('#employee-save');
  const errorBox = $('#employee-form-error');
  const fields = Object.fromEntries(new FormData(form).entries());
  errorBox.textContent = '';
  saveButton.disabled = true;
  saveButton.textContent = 'Menyimpan…';
  try {
    if (editingEmployeeId) {
      const { error } = await supabase.from('employees').update({
        employee_no: fields.employee_no.trim(), department: fields.department.trim(),
        position: fields.position.trim(), employment_status: fields.employment_status,
        join_date: fields.join_date || null, notes: fields.notes.trim(), updated_at: new Date().toISOString()
      }).eq('id', editingEmployeeId);
      if (error) throw error;
      say('Data karyawan diperbarui.');
    } else if (hiringApplicantId) {
      const { error } = await supabase.rpc('convert_applicant_to_employee', {
        p_applicant_id: hiringApplicantId,
        p_employee_no: fields.employee_no.trim(),
        p_department: fields.department.trim(),
        p_position: fields.position.trim(),
        p_employment_status: fields.employment_status,
        p_join_date: fields.join_date || null,
        p_notes: fields.notes.trim()
      });
      if (error) throw error;
      const applicant = applicants.find(a => a.id === hiringApplicantId);
      say(`${applicant?.full_name || 'Kandidat'} ditambahkan ke tracking karyawan.`);
    }
    $('#employee-modal').classList.add('hidden');
    editingEmployeeId = null;
    hiringApplicantId = null;
    await loadView(activeView === 'employees' ? 'employees' : 'stage3');
  } catch (error) {
    errorBox.textContent = error.message || 'Data gagal disimpan.';
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Simpan data';
  }
}

function bindHire() {
  $$('[data-hire]').forEach(button => button.addEventListener('click', () => {
    const applicant = applicants.find(a => a.id === button.dataset.hire);
    if (applicant) openEmployeeModal(null, applicant);
  }));
}
function bindEmployeeEdit() {
  $$('[data-edit-employee]').forEach(button => button.addEventListener('click', () => {
    const employee = employees.find(e => e.id === button.dataset.editEmployee);
    if (employee) openEmployeeModal(employee);
  }));
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function exportEmployees() {
  const button = $('#export-employees');
  button.disabled = true;
  button.textContent = 'Menyiapkan XLSX…';
  try {
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const employeeRowsData = employees.map(employee => {
      const applicant = applicants.find(a => a.id === employee.applicant_id);
      const data = applicant?.application_data || {};
      return {
        'Nomor Karyawan': employee.employee_no,
        'Nama Lengkap': applicant?.full_name || data.nama || '',
        'NIK': applicant?.nik || data.nik || '',
        'Posisi': employee.position || applicant?.position || '',
        'Departemen': employee.department || '',
        'Status Karyawan': employee.employment_status || '',
        'Tanggal Masuk': employee.join_date || '',
        'Tanggal Dibuat': employee.created_at || '',
        'Catatan HR': employee.notes || ''
      };
    });
    const applicationRows = employees.map(employee => {
      const applicant = applicants.find(a => a.id === employee.applicant_id);
      const data = applicant?.application_data || {};
      const standard = {
        'Nomor Karyawan': employee.employee_no,
        'Nama Lengkap': applicant?.full_name || data.nama || '',
        'NIK': applicant?.nik || data.nik || '',
        'Posisi Dilamar': applicant?.position || data.posisi || ''
      };
      const extra = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, cellText(value)]));
      return { ...standard, ...extra };
    });
    const workbook = XLSX.utils.book_new();
    const employeeHeaders = [...new Set(employeeRowsData.flatMap(row => Object.keys(row)))];
    const employeeSheet = XLSX.utils.json_to_sheet(employeeRowsData, { header: employeeHeaders });
    employeeSheet['!cols'] = employeeHeaders.map(key => ({ wch: Math.min(34, Math.max(14, key.length + 4)) }));
    XLSX.utils.book_append_sheet(workbook, employeeSheet, 'Karyawan');

    const appHeaders = [...new Set(applicationRows.flatMap(row => Object.keys(row)))];
    if (appHeaders.length) {
      const applicationSheet = XLSX.utils.json_to_sheet(applicationRows, { header: appHeaders });
      applicationSheet['!cols'] = appHeaders.map(key => ({ wch: Math.min(34, Math.max(14, key.length + 4)) }));
      XLSX.utils.book_append_sheet(workbook, applicationSheet, 'Data Lamaran');
    }
    XLSX.writeFile(workbook, `Data_Karyawan_${new Date().toISOString().slice(0, 10)}.xlsx`);
    say(`${employees.length} data karyawan diekspor ke XLSX.`);
  } catch (error) {
    say(error.message || 'File XLSX gagal dibuat.');
  } finally {
    button.disabled = false;
    button.textContent = 'Unduh XLSX ↓';
  }
}

function sanitizeAndValidateTemplate(html, baselineHtml) {
  const parser = new DOMParser();
  const candidateDoc = parser.parseFromString(html, 'text/html');
  const baselineDoc = parser.parseFromString(baselineHtml, 'text/html');
  const form = candidateDoc.querySelector('#applicationForm');
  if (!form) throw new Error('Master HTML wajib memiliki form dengan id="applicationForm".');
  const baselineNames = new Set([...baselineDoc.querySelectorAll('#applicationForm [name]')].map(el => el.getAttribute('name')).filter(Boolean));
  const newNames = new Set([...form.querySelectorAll('[name]')].map(el => el.getAttribute('name')).filter(Boolean));
  const missing = [...baselineNames].filter(name => !newNames.has(name));
  if (missing.length) {
    const preview = missing.slice(0, 8).join(', ');
    throw new Error(`Master baru menghilangkan ${missing.length} field lama (${preview}${missing.length > 8 ? ', …' : ''}). Semua atribut name harus dipertahankan.`);
  }
  candidateDoc.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv=refresh]').forEach(el => el.remove());
  candidateDoc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (['href', 'src', 'action', 'formaction'].includes(attr.name.toLowerCase()) && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
    });
  });
  candidateDoc.querySelectorAll('form').forEach(el => el.removeAttribute('action'));
  return {
    html: '<!doctype html>\n' + candidateDoc.documentElement.outerHTML,
    schemaVersion: candidateDoc.querySelector('meta[name="form-schema-version"]')?.content || 'custom'
  };
}

async function storeAndActivateTemplate(html, filename) {
  const [baselineResponse] = await Promise.all([fetch(TEMPLATE_URL, { cache: 'no-store' })]);
  if (!baselineResponse.ok) throw new Error('Master bawaan tidak dapat dimuat untuk validasi field.');
  const baselineHtml = await baselineResponse.text();
  const validated = sanitizeAndValidateTemplate(html, baselineHtml);
  const { data, error } = await supabase.from('print_templates').insert({
    source_filename: filename,
    schema_version: validated.schemaVersion,
    html_content: validated.html,
    is_active: false,
    uploaded_by: currentUserId
  }).select('id').single();
  if (error) throw error;
  const { error: activateError } = await supabase.rpc('activate_print_template', { p_template_id: data.id });
  if (activateError) throw activateError;
}

function bindTemplateManager(migrationMissing) {
  if (migrationMissing) return;
  $('#template-upload-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const file = $('#template-file').files?.[0];
    const button = form.querySelector('button[type="submit"]');
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') { say('Pilih file HTML.'); return; }
    if (file.size > 300 * 1024) { say('Ukuran master HTML maksimal 300 KB.'); return; }
    button.disabled = true; button.textContent = 'Memvalidasi…';
    try {
      await storeAndActivateTemplate(await file.text(), file.name);
      say('Master HTML baru berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Master HTML gagal disimpan.'); }
    finally { button.disabled = false; button.textContent = 'Simpan & aktifkan'; }
  });
  $('#restore-template')?.addEventListener('click', async () => {
    const button = $('#restore-template');
    button.disabled = true; button.textContent = 'Memulihkan…';
    try {
      const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Master bawaan tidak ditemukan.');
      await storeAndActivateTemplate(await response.text(), 'Master bawaan repository');
      say('Master bawaan berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Master bawaan gagal diaktifkan.'); }
    finally { button.disabled = false; button.textContent = 'Pulihkan master bawaan'; }
  });
  $$('[data-template-activate]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('activate_print_template', { p_template_id: button.dataset.templateActivate });
      if (error) throw error;
      say('Versi master berhasil diaktifkan.');
      await loadView('print');
    } catch (error) { say(error.message || 'Versi master gagal diaktifkan.'); button.disabled = false; }
  }));
}

async function loadView(view) {
  activeView = view;
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#page-title').textContent = TITLES[view] || 'Dashboard';
  content.innerHTML = '<section class="panel placeholder-panel"><div><div class="placeholder-symbol">◌</div><h2>Memuat data</h2></div></section>';
  try {
    await refreshData();
    if (view === 'dashboard') renderDashboard();
    else if (view === 'stage1') renderPlaceholder('Rekrutmen Tahap 1', 'Area tahap 1');
    else if (view === 'stage2') renderStage2();
    else if (view === 'stage3') renderStage3();
    else if (view === 'employees') renderEmployees();
    else if (view === 'print') renderPrint();
    else renderPlaceholder('Laporan Rekrutmen', 'Ringkasan dan laporan rekrutmen');
  } catch (error) {
    content.innerHTML = `<section class="panel placeholder-panel"><div><div class="placeholder-symbol">!</div><h2>Data tidak dapat dimuat</h2><p>${esc(error.message || 'Periksa koneksi Supabase.')}</p><button id="retry-load" class="btn btn-secondary" style="margin-top:18px">Coba lagi</button></div></section>`;
    $('#retry-load')?.addEventListener('click', () => loadView(view));
  }
}

async function openAdmin(session) {
  const { data: isAdmin, error } = await supabase.rpc('is_portal_admin');
  if (error) {
    await supabase.auth.signOut();
    console.error('Portal admin access check failed:', error);
    throw new Error('Login berhasil, tetapi pemeriksaan akses admin gagal. Pastikan supabase/SETUP-ALL-IN-ONE.sql sudah berhasil dijalankan di Supabase SQL Editor.');
  }
  if (!isAdmin) {
    await supabase.auth.signOut();
    throw new Error('Akun berhasil login, tetapi hak akses HR belum aktif. Pastikan username telah terdaftar pada admin_login_credentials melalui SETUP-ALL-IN-ONE.sql.');
  }
  currentUserId = session.user.id;
  const { data: profile } = await supabase.from('admin_users').select('display_name').eq('user_id', session.user.id).maybeSingle();
  adminDisplayName = profile?.display_name || session.user.email || 'HR Admin';
  $('#admin-name').textContent = adminDisplayName;
  loginView.classList.add('hidden');
  shell.classList.remove('hidden');
  await loadView('dashboard');
}

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const user = $('#login-user').value.trim().toLowerCase();
  const pin = $('#login-pin').value.trim();
  const errorBox = $('#login-error');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  errorBox.textContent = '';
  if (!isConfigured) { errorBox.textContent = 'Konfigurasi Supabase belum diisi.'; return; }
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(user)) {
    errorBox.textContent = 'Username 3–32 karakter. Gunakan huruf kecil, angka, titik, _ atau -.';
    return;
  }
  if (!/^\d{4,12}$/.test(pin)) {
    errorBox.textContent = 'PIN harus terdiri dari 4–12 angka.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Memeriksa…';
  try {
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/admin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify({ username: user, pin })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.session?.access_token || !result.session?.refresh_token) {
      throw new Error(result.error || 'Username atau PIN tidak sesuai.');
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });
    if (error) throw error;
    await openAdmin(data.session);
    $('#login-pin').value = '';
  } catch (error) {
    console.error('Username/PIN login failed:', error);
    errorBox.textContent = error.message || 'Login gagal. Periksa username dan PIN.';
    button.disabled = false;
    button.textContent = 'Masuk ↗';
  }
});

$('#admin-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (button) loadView(button.dataset.view);
});
$('#logout-btn').addEventListener('click', async () => {
  await supabase?.auth.signOut();
  shell.classList.add('hidden');
  loginView.classList.remove('hidden');
  $('#login-pin').value = '';
  const loginButton = $('#login-form button[type="submit"]');
  if (loginButton) { loginButton.disabled = false; loginButton.textContent = 'Masuk ↗'; }
  currentUserId = null;
});

async function init() {
  if (!isConfigured) {
    $('#login-error').textContent = 'Isi Project URL dan Publishable key di assets/js/config.js.';
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    try { await openAdmin(session); }
    catch (error) { $('#login-error').textContent = error.message; }
  }
}
init();
