import { supabase, isConfigured } from './supabase.js';
import { MAX_CV_BYTES, CV_BUCKET, CV_PATH_PREFIX, MAX_KTP_BYTES, KTP_BUCKET, KTP_PATH_PREFIX } from './config.js';
import { $, esc, ageFrom, candidateToken, newCandidateToken, storeCandidateToken, stageUrl, setBusy } from './common.js';
import { extractKtpText, formatKtpAddress } from './ktp-ocr.js';

const root = $('#candidate-app');
const choices = items => items.map(value => ({value,label:value}));
const educationChoices = choices(['Tidak sekolah','SD / Sederajat','SMP / Sederajat','SMA / SMK','D1','D2','D3','D4','S1','S2','S3']);
const religionChoices = choices(['Islam','Kristen Protestan','Katolik','Hindu','Buddha','Konghucu','Kepercayaan','Lainnya']);
const personalFields = [
  {name:'posisi',label:'Posisi yang dilamar',required:true},
  {name:'pekerjaan',label:'Pekerjaan sesuai KTP'},
  {name:'nama',label:'Nama lengkap',required:true},
  {name:'nik',label:'NIK',required:true,inputmode:'numeric',maxlength:16},
  {name:'tempat_lahir',label:'Tempat lahir',required:true},
  {name:'tanggal_lahir',label:'Tanggal lahir',type:'date',required:true},
  {name:'gender',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan']),required:true},
  {name:'tinggi',label:'Tinggi badan (cm)',type:'number',min:80,max:240},
  {name:'berat',label:'Berat badan (kg)',type:'number',min:20,max:250},
  {name:'gol_darah',label:'Golongan darah',type:'select',options:choices(['A','B','AB','O','Tidak tahu'])},
  {name:'agama',label:'Agama',type:'select',options:religionChoices},
  {name:'warga_negara',label:'Kewarganegaraan',type:'select',options:choices(['WNI','WNA']),value:'WNI'},
  {name:'telepon',label:'No. telepon / WhatsApp',type:'tel',required:true},
  {name:'email',label:'Email',type:'email'}
];
const addressFields = [
  {name:'alamat_tipe',label:'Jenis alamat',type:'select',options:choices(['Jalan','Dusun','Kampung','Perumahan','Komplek','Lingkungan','Gang','Lorong','Blok','Apartemen','Lainnya'])},
  {name:'alamat_jalan',label:'Nama jalan / dusun / perumahan',wide:true,required:true},
  {name:'alamat_rt',label:'RT',inputmode:'numeric',maxlength:3,required:true},
  {name:'alamat_rw',label:'RW',inputmode:'numeric',maxlength:3,required:true},
  {name:'alamat_desa',label:'Desa / kelurahan',required:true},
  {name:'alamat_kecamatan',label:'Kecamatan',required:true},
  {name:'alamat_kota_jenis',label:'Jenis kabupaten / kota'},
  {name:'alamat_kota_nama',label:'Kabupaten / kota',required:true},
  {name:'alamat_provinsi',label:'Provinsi',required:true},
  {name:'alamat_kodepos',label:'Kode pos'}
];
const parentFields = [
  {name:'ayah_nama',label:'Nama ayah'}, {name:'ayah_umur',label:'Umur ayah (isi 0 / - jika meninggal)',type:'text',inputmode:'numeric',pattern:'(?:-|[0-9]{1,3})'},
  {name:'ayah_pendidikan',label:'Pendidikan ayah',type:'select',options:educationChoices}, {name:'ayah_pekerjaan',label:'Pekerjaan ayah'},
  {name:'ibu_nama',label:'Nama ibu'}, {name:'ibu_umur',label:'Umur ibu (isi 0 / - jika meninggal)',type:'text',inputmode:'numeric',pattern:'(?:-|[0-9]{1,3})'},
  {name:'ibu_pendidikan',label:'Pendidikan ibu',type:'select',options:educationChoices}, {name:'ibu_pekerjaan',label:'Pekerjaan ibu'}
];
const maritalField = {name:'status_kawin',label:'Status Perkawinan Anda',type:'select',options:choices(['Belum kawin','Kawin','Cerai hidup','Cerai mati']),required:true};
const spouseFields = [
  {name:'pasangan_nama',label:'Nama suami / istri'},
  {name:'pasangan_lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},
  {name:'pasangan_umur',label:'Umur',type:'number',min:15,max:120},
  {name:'pasangan_pendidikan',label:'Pendidikan',type:'select',options:educationChoices},
  {name:'pasangan_pekerjaan',label:'Pekerjaan'}
];
const educationRows = [
  {prefix:'sd',title:'SD / Sederajat',fields:[['instansi','Nama sekolah'],['kota','Kota'],['lulus','Tahun lulus','year']]},
  {prefix:'smp',title:'SMP / Sederajat',fields:[['instansi','Nama sekolah'],['kota','Kota'],['lulus','Tahun lulus','year']]},
  {prefix:'sma',title:'SMA / SMK',fields:[['instansi','Nama sekolah'],['kota','Kota'],['jurusan','Jurusan'],['lulus','Tahun lulus','year']]},
  {prefix:'diploma',title:'Diploma (D1–D4)',fields:[['instansi','Nama instansi'],['kota','Kota'],['jurusan','Jurusan'],['lulus','Tahun lulus','year']]},
  {prefix:'universitas',title:'Universitas (S1/S2/S3)',fields:[['instansi','Nama universitas'],['kota','Kota'],['jurusan','Jurusan'],['lulus','Tahun lulus','year']]}
];
const workKeys = [
  ['perusahaan','Nama perusahaan'],['jabatan','Jabatan'],['usaha','Jenis usaha'],
  ['mulai_bulan','Mulai bulan','month'],['mulai_tahun','Mulai tahun','year'],
  ['selesai_bulan','Sampai bulan','month'],['selesai_tahun','Sampai tahun','year'],
  ['masih_bekerja','Masih bekerja di sini','checkbox'],['jumlah','Jumlah karyawan','number'],
  ['atasan','Nama atasan langsung'],['gaji','Gaji terakhir (Rp)','currency'],['alasan','Alasan berhenti']
];
const refKeys = [
  ['nama','Nama lengkap'],['hubungan','Hubungan'],['telepon','No. telepon / WhatsApp'],['alamat','Alamat']
];
const stepNames = ['Identitas','Keluarga & pendidikan','Kemampuan & pengalaman','Informasi tambahan','Lampiran'];
const LOCAL_DRAFT_PREFIX = 'portal_candidate_draft_v3:';
const LEGACY_LOCAL_DRAFT_PREFIX = 'portal_candidate_draft_v2:';
let draftToken = '';
let initialData = {};
let cvFilename = '';
let activeStep = 0;
let saveTimer = null;
let saveInFlight = Promise.resolve();
let mediaStream = null;
let cameraFallback = false;
let ktpPath = '';
const MAX_OCR_ATTEMPTS = 3;
let ocrAttempts = 0;
let villageSearchTimer = null;

const selectOptions = (options, selected) => options.map(o => {
  const item = typeof o === 'string' ? {value:o,label:o} : o;
  return `<option value="${esc(item.value)}" ${String(selected??'')===String(item.value)?'selected':''}>${esc(item.label)}</option>`;
}).join('');
function formatCurrency(value){
  const digits=String(value??'').replace(/\D/g,'');
  return digits ? new Intl.NumberFormat('id-ID').format(Number(digits)) : '';
}
function fieldHtml(field, values={}){
  let value=values[field.name] ?? field.value ?? '';
  if(['gender','pasangan_lp','saudara1_lp','saudara2_lp','saudara3_lp','saudara4_lp','anak1_lp','anak2_lp','anak3_lp'].includes(field.name)){
    value=value==='L'?'Laki-laki':value==='P'?'Perempuan':value;
  }
  const required=field.required?'required':'';
  const wide=field.wide?'wide':'';
  const id=`f-${field.name}`;
  const label=`<label for="${esc(id)}">${esc(field.label)}</label>`;
  let control='';
  if(field.type==='checkbox'){
    control=`<input id="${esc(id)}" name="${esc(field.name)}" type="checkbox" value="true" ${String(value)==='true'?'checked':''}>`;
  }else if(field.type==='select' || field.type==='year'){
    const options=field.type==='year' ? Array.from({length:57},(_,i)=>String(new Date().getFullYear()-i)) : field.options;
    control=`<select id="${esc(id)}" name="${esc(field.name)}" class="select" ${required}><option value="">${esc(field.placeholder||'Pilih')}</option>${selectOptions(options,value)}</select>`;
  }else if(field.type==='textarea'){
    control=`<textarea id="${esc(id)}" name="${esc(field.name)}" ${required}>${esc(value)}</textarea>`;
  }else if(field.currency){
    control=`<input id="${esc(id)}" name="${esc(field.name)}" type="text" inputmode="numeric" data-format-number="idr" value="${esc(formatCurrency(value))}" ${required}>`;
  }else{
    const type=field.type||'text';
    const inputmode=field.inputmode?`inputmode="${field.inputmode}"`:type==='number'?'inputmode="numeric"':'';
    control=`<input id="${esc(id)}" name="${esc(field.name)}" type="${type}" value="${esc(value)}" ${required} ${field.readonly?'readonly':''} ${inputmode} ${field.maxlength?`maxlength="${field.maxlength}"`:''} ${field.min!==undefined?`min="${field.min}"`:''} ${field.max!==undefined?`max="${field.max}"`:''} ${field.step?`step="${field.step}"`:''} ${field.pattern?`pattern="${field.pattern}"`:''}>`;
  }
  return `<div class="form-field ${wide}">${label}${control}</div>`;
}
function sectionHtml(letter,title,body){return `<section class="form-section"><h2><span class="section-bullet">${letter}</span>${title}</h2>${body}</section>`;}
function basicGrid(fields,values={}){return `<div class="form-grid">${fields.map(f=>fieldHtml(f,values)).join('')}</div>`;}
function countSelect(name,label,max,value,min=0){
  return fieldHtml({name,label,type:'select',options:Array.from({length:max-min+1},(_,i)=>String(i+min))}, {[name]:String(value??min)});
}
function renderAddress(values={}){
  const different=String(values.domisili_berbeda||'false')==='true' || (!!values.domisili && !!values.alamat_asal && values.domisili!==values.alamat_asal);
  const regionSelect=(name,label,disabled=false)=>fieldHtml({name,label,type:'select',options:[],required:true},values)+`<!--region-->`;
  return sectionHtml('⌖','ALAMAT SESUAI KTP',`
    <div class="form-grid">
      ${fieldHtml({name:'alamat_provinsi_id',label:'Provinsi',type:'select',options:[],required:true},values)}
      ${fieldHtml({name:'alamat_kota_id',label:'Kabupaten / Kota',type:'select',options:[],required:true},values)}
      ${fieldHtml({name:'alamat_kecamatan_id',label:'Kecamatan',type:'select',options:[],required:true},values)}
      <div class="form-field"><label for="f-alamat_desa_search">Cari desa / kelurahan</label><input id="f-alamat_desa_search" name="alamat_desa_search" type="search" placeholder="Ketik nama desa / kelurahan" autocomplete="off"></div>
      ${fieldHtml({name:'alamat_desa_id',label:'Desa / Kelurahan',type:'select',options:[],required:true},values)}
      ${fieldHtml({name:'alamat_tipe',label:'Jenis alamat',type:'select',options:addressFields[0].options},values)}
      ${fieldHtml({name:'alamat_jalan',label:'Nama jalan / dusun / perumahan',wide:true,required:true},values)}
      ${fieldHtml({name:'alamat_rt',label:'RT',inputmode:'numeric',maxlength:3,required:true},values)}
      ${fieldHtml({name:'alamat_rw',label:'RW',inputmode:'numeric',maxlength:3,required:true},values)}
      ${fieldHtml({name:'alamat_kodepos',label:'Kode pos (otomatis)',readonly:true},values)}
    </div>
    <input type="hidden" name="alamat_provinsi" value="${esc(values.alamat_provinsi||'')}">
    <input type="hidden" name="alamat_kota_jenis" value="${esc(values.alamat_kota_jenis||'')}">
    <input type="hidden" name="alamat_kota_nama" value="${esc(values.alamat_kota_nama||'')}">
    <input type="hidden" name="alamat_kecamatan" value="${esc(values.alamat_kecamatan||'')}">
    <input type="hidden" name="alamat_desa" value="${esc(values.alamat_desa||'')}">
    <input type="hidden" name="alamat_wilayah_type" value="${esc(values.alamat_wilayah_type||'')}">
    <input type="hidden" name="alamat_asal" value="${esc(values.alamat_asal||'')}">
    <div class="address-preview" id="address-preview"></div>
    <label class="inline-toggle"><input type="checkbox" name="domisili_berbeda" value="true" ${different?'checked':''}><span>Alamat domisili berbeda</span></label>
    <div class="conditional-fields" data-conditional="true" data-block="domicile" ${different?'':'hidden'}>${basicGrid([{name:'domisili',label:'Alamat domisili',type:'textarea',wide:true}],values)}</div>
  `);
}
function renderFamily(values={}){
  const siblingCountValue=String(values.saudara_count??'0');
  const siblingCount=siblingCountValue==='3+'?3:Math.min(3,Math.max(0,Number(siblingCountValue)||0));
  const selfRow=`<div class="repeat-row"><div class="repeat-title">Anda (otomatis)</div>${basicGrid([
    {name:'saudara1_nama',label:'Nama',readonly:true},
    {name:'saudara1_lp',label:'Jenis kelamin',readonly:true},
    {name:'saudara1_umur',label:'Umur',readonly:true},
    {name:'saudara1_pendidikan',label:'Pendidikan',type:'select',options:educationChoices},
    {name:'saudara1_pekerjaan',label:'Pekerjaan'}
  ],{...values,saudara1_nama:values.nama||'',saudara1_lp:values.gender==='L'?'Laki-laki':values.gender==='P'?'Perempuan':'',saudara1_umur:ageFrom(values.tanggal_lahir)||''})}</div>`;
  const siblings=Array.from({length:siblingCount},(_,i)=>{
    const n=i+2,p=`saudara${n}_`;
    const fs=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:120},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
    return `<div class="repeat-row"><div class="repeat-title">Saudara ${i+1}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  const childrenCount=Math.min(3,Math.max(0,Number(values.anak_count||0)));
  const children=Array.from({length:childrenCount},(_,i)=>{
    const n=i+1,p=`anak${n}_`,fs=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:100},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
    return `<div class="repeat-row"><div class="repeat-title">Anak ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  const spouseHidden=values.status_kawin==='Kawin'?'':'hidden';
  const childrenHidden=!values.status_kawin||values.status_kawin==='Belum kawin'?'hidden':'';
  const siblingOptions=choices(['0','1','2','3+'].map(v=>v==='3+'?'3 atau lebih':v));
  return sectionHtml('B','SUSUNAN KELUARGA',
    `<div class="repeat-title">Orang tua</div>${basicGrid(parentFields,values)}
    <div class="repeat-row"><div class="repeat-title">Saudara kandung · termasuk Anda</div>
      ${fieldHtml({name:'saudara_count',label:'Jumlah saudara kandung selain Anda',type:'select',options:[{value:'0',label:'0'},{value:'1',label:'1'},{value:'2',label:'2'},{value:'3+',label:'3 atau lebih'}]},values)}
      <div id="siblings-rows">${selfRow}${siblings}</div>
    </div>
    <div class="repeat-row">${basicGrid([maritalField],values)}</div>
    <div class="conditional-fields" data-conditional="true" data-block="spouse" ${spouseHidden}><div class="repeat-title">Suami / istri</div>${basicGrid(spouseFields,values)}</div>
    <div class="conditional-fields" data-conditional="true" data-block="children" ${childrenHidden}><div class="repeat-title">Anak</div>${countSelect('anak_count','Jumlah anak',3,childrenCount,0)}<div id="children-rows">${children}</div></div>`);
}
function renderEducation(values={}){
  const levels=['Tidak sekolah','SD / Sederajat','SMP / Sederajat','SMA / SMK','D1','D2','D3','D4','S1','S2','S3'];
  const level=values.pendidikan_terakhir||'';
  const rank={'Tidak sekolah':0,'SD / Sederajat':1,'SMP / Sederajat':2,'SMA / SMK':3,D1:4,D2:5,D3:6,D4:7,S1:8,S2:9,S3:10};
  const selected=rank[level]??0;
  return sectionHtml('C','PENDIDIKAN FORMAL',`
    ${fieldHtml({name:'pendidikan_terakhir',label:'Pendidikan Terakhir',type:'select',options:choices(levels),required:true},values)}
    ${educationRows.map(row=>{
      const rowLevel=row.prefix==='sd'?1:row.prefix==='smp'?2:row.prefix==='sma'?3:row.prefix==='diploma'?4:8;
      const visible=selected>=rowLevel && !(row.prefix==='diploma'&&selected>=8);
      const fields=row.fields.map(([key,label,type])=>({name:`${row.prefix}_${key}`,label,type:type==='year'?'year':undefined}));
      return `<div class="repeat-row" data-education-row="${row.prefix}" ${visible?'':'hidden'}><div class="repeat-title">${row.title}</div>${basicGrid(fields,values)}</div>`;
    }).join('')}`);
}
function renderLanguages(values={}){
  const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0)));
  const languageOptions=['Inggris','Mandarin','Arab','Jepang','Rusia','Jerman','Prancis','Latin','Lainnya'];
  const rows=Array.from({length:count},(_,i)=>{
    const n=i+1,p=`bahasa${n}`;
    const fs=[{name:p,label:'Bahasa asing',type:'select',options:choices(languageOptions)},{name:p+'_bicara',label:'Berbicara',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_baca',label:'Membaca',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_tulis',label:'Menulis',type:'select',options:choices(['Dasar','Menengah','Mahir'])}];
    return `<div class="repeat-row"><div class="repeat-title">Bahasa ${n}</div>${basicGrid(fs,values)}
      <div class="conditional-fields" data-language-other="${n}" ${values[p]==='Lainnya'?'':'hidden'}>${fieldHtml({name:p+'_lainnya',label:'Nama bahasa lainnya'},values)}</div>
    </div>`;
  }).join('');
  return sectionHtml('D','<strong>KEMAMPUAN BAHASA (SELAIN BAHASA INDONESIA)</strong>',`${countSelect('bahasa_count','Jumlah bahasa asing',4,count,0)}<div id="language-rows">${rows}</div>`);
}
function renderWork(values={}){
  const count=Math.min(3,Math.max(0,Number(values.kerja_count||0)));
  const months=choices(['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']);
  const rows=Array.from({length:count},(_,i)=>{
    const n=i+1,p=`kerja${n}_`;
    const fs=workKeys.map(([key,label,type])=>{
      if(key.endsWith('_bulan'))return {name:p+key,label,type:'select',options:months};
      if(key.endsWith('_tahun'))return {name:p+key,label,type:'year'};
      if(type==='checkbox')return {name:p+key,label,type:'checkbox'};
      return {name:p+key,label,currency:type==='currency',type:type==='number'?'number':undefined,min:type==='number'?0:undefined,wide:['perusahaan','alasan'].includes(key)};
    });
    const endFields=fs.filter(field=>/selesai_(bulan|tahun)$/.test(field.name.slice(p.length)));
    const otherFields=fs.filter(field=>!endFields.includes(field));
    return `<div class="repeat-row"><div class="repeat-title">Pengalaman ${n}${n===1?' · terakhir':''}</div>${basicGrid(otherFields,values)}<div data-work-end="${n}">${basicGrid(endFields,values)}</div></div>`;
  }).join('');
  return sectionHtml('F','PENGALAMAN KERJA',`${countSelect('kerja_count','Jumlah pengalaman kerja',3,count,0)}<div class="conditional-fields" data-conditional="true" data-block="work-rows" ${count?'':'hidden'}><div id="work-rows">${rows}</div></div>`);
}
function renderReferences(values={}){
  const fields=[
    {name:'kontak_darurat_nama',label:'Nama lengkap',required:true},
    {name:'kontak_darurat_hubungan',label:'Hubungan',type:'select',options:choices(['Orang tua','Suami / Istri','Anak','Saudara','Kerabat','Teman','Lainnya']),required:true},
    {name:'kontak_darurat_telepon',label:'No. telepon / WhatsApp',type:'tel',required:true},
    {name:'kontak_darurat_alamat',label:'Alamat',type:'textarea',wide:true}
  ];
  return sectionHtml('H','ORANG YANG BISA DIHUBUNGI DALAM KEADAAN DARURAT',basicGrid(fields,values));
}
function renderForm(values={}){
  initialData=values;
  activeStep=Math.min(stepNames.length-1,Math.max(0,Number(values.__form_step||0)));
  const step0=`<div class="form-step" data-form-step="0">${sectionHtml('A','DATA PRIBADI',basicGrid(personalFields,values))}${renderAddress(values)}</div>`;
  const step1=`<div class="form-step" data-form-step="1">${renderFamily(values)}${renderEducation(values)}</div>`;
  const step2=`<div class="form-step" data-form-step="2">${renderLanguages(values)}${sectionHtml('E','HOBI',basicGrid([{name:'hobby',label:'Hobi dan minat',type:'textarea',wide:true}],values))}${renderWork(values)}</div>`;
  const step3=`<div class="form-step" data-form-step="3">${sectionHtml('G','EKSPEKTASI',basicGrid([{name:'mulai_kerja',label:'Tanggal mulai bisa bekerja',type:'date'},{name:'gaji_harapan',label:'Gaji yang diharapkan (Rp)',currency:true},{name:'fasilitas_harapan',label:'Fasilitas lain yang diharapkan',wide:true}],values))}${renderReferences(values)}${sectionHtml('I','PERTANYAAN TERBUKA',basicGrid([{name:'jawaban1',label:'Apa yang Anda ketahui tentang perusahaan kami?',type:'textarea',wide:true},{name:'jawaban2',label:'Ceritakan tentang pribadi Anda.',type:'textarea',wide:true},{name:'jawaban3',label:'Apa yang akan Anda lakukan untuk perusahaan kami jika diterima?',type:'textarea',wide:true}],values))}</div>`;
  const step4=`<div class="form-step" data-form-step="4">${sectionHtml('J','PERNYATAAN',`<label class="consent-wrap"><input type="checkbox" id="setuju" name="setuju" value="true" ${values.setuju?'checked':''} required><span>Dengan ini saya menyatakan semua data yang saya isi benar.</span></label>`)}<section class="form-section"><h2><span class="section-bullet">CV</span>CURRICULUM VITAE</h2><label class="upload-zone cv-upload-zone"><span class="upload-icon">↥</span><b id="cv-filename">${esc(cvFilename||'Unggah CV (PDF)')}</b><small>PDF · Maks. 10 MB</small><input type="file" id="cv-file" accept="application/pdf,.pdf"></label><div class="cv-upload-state" id="cv-upload-state"></div><div class="cv-disc-prompt" id="cv-disc-prompt" hidden><b>CV berhasil diunggah.</b><p>Setelah lamaran dikirim, Anda dapat memulai tes DISC sekarang atau melanjutkannya nanti.</p><button type="button" class="btn btn-secondary full" id="cv-continue-submit">Kirim lamaran sekarang</button><button type="button" class="manual-entry" id="cv-do-later">Putuskan DISC setelah lamaran dikirim</button></div></section></div>`;
  return `<div class="step-top"><span class="stage-kicker">FORMULIR LAMARAN KERJA</span><span class="step-number" id="wizard-count"></span></div><div class="wizard-progress"><span id="wizard-progress-bar"></span></div><section class="candidate-card form-wizard-card"><div class="wizard-heading"><div><h1 class="candidate-title">Data pelamar</h1><div class="wizard-step-label" id="wizard-step-label"></div></div><span class="wizard-save-state" id="draft-save-state" aria-live="polite">●</span></div><form id="application-form" novalidate><input type="hidden" name="ktp_path" value="${esc(values.ktp_path||'')}">${step0}${step1}${step2}${step3}${step4}<div id="form-error" class="form-error" role="alert"></div><div class="wizard-actions"><button type="button" class="btn btn-secondary" id="wizard-prev">Kembali</button><button type="button" class="btn btn-primary" id="wizard-next">Lanjut</button></div></form></section>`;
}

function buildAddress(data){
  const address=formatKtpAddress(data);
  data.alamat_asal=address;
  data.domisili=String(data.domisili_berbeda)==='true' && String(data.domisili||'').trim() ? String(data.domisili).trim() : address;
  return data;
}
function collect(form){
  const data={};
  // Keep even conditionally hidden values in the draft. If a candidate changes a
  // selection by mistake, hiding a group must not erase what was already typed.
  for(const el of [...form.elements]){
    const key=el.name;
    if(!key||el.disabled||el.type==='file') continue;
    if(el.type==='checkbox'){data[key]=el.checked?'true':'false';continue;}
    data[key]=el.value;
  }
  const genderMap={'Laki-laki':'L','Perempuan':'P'};
  if(genderMap[data.gender]) data.gender=genderMap[data.gender];
  if(genderMap[data.saudara1_lp]) data.saudara1_lp=genderMap[data.saudara1_lp];
  if(genderMap[data.pasangan_lp]) data.pasangan_lp=genderMap[data.pasangan_lp];
  for(let i=2;i<=4;i++){const key=`saudara${i}_lp`;if(genderMap[data[key]])data[key]=genderMap[data[key]];}
  for(let i=1;i<=3;i++){const key=`anak${i}_lp`;if(genderMap[data[key]])data[key]=genderMap[data[key]];}
  data.umur=ageFrom(data.tanggal_lahir);
  data.nama_terang=data.nama||'';
  return buildAddress(data);
}
function syncApplicantRow(form){
  const values=collect(form);
  const set=(name,value)=>{const el=form.querySelector(`[name="${name}"]`);if(el)el.value=value||'';};
  set('saudara1_nama',values.nama);set('saudara1_lp',values.gender==='L'?'Laki-laki':values.gender==='P'?'Perempuan':'');set('saudara1_umur',values.umur);set('umur',values.umur);set('nama_terang',values.nama);
}
function updateEducationVisibility(form){
  const ranks={'Tidak sekolah':0,'SD / Sederajat':1,'SMP / Sederajat':2,'SMA / SMK':3,D1:4,D2:5,D3:6,D4:7,S1:8,S2:9,S3:10};
  const selected=ranks[form.querySelector('[name="pendidikan_terakhir"]')?.value||'']??0;
  form.querySelectorAll('[data-education-row]').forEach(row=>{
    const prefix=row.dataset.educationRow;
    const rank=prefix==='sd'?1:prefix==='smp'?2:prefix==='sma'?3:prefix==='diploma'?4:8;
    row.hidden=selected<rank||(prefix==='diploma'&&selected>=8);
  });
}
function updateDynamic(form,values){
  const marital=form.querySelector('[name="status_kawin"]')?.value||values.status_kawin||'';
  const spouse=form.querySelector('[data-block="spouse"]');if(spouse)spouse.hidden=marital!=='Kawin';
  const children=form.querySelector('[data-block="children"]');if(children)children.hidden=!marital||marital==='Belum kawin';
  const workCount=Number(form.querySelector('#kerja_count')?.value??values.kerja_count??0);
  const work=form.querySelector('[data-block="work-rows"]');if(work)work.hidden=workCount===0;
  const domicile=form.querySelector('[data-block="domicile"]');
  const domicileToggle=form.querySelector('[name="domisili_berbeda"]');
  if(domicile)domicile.hidden=!domicileToggle?.checked;
  form.querySelectorAll('[data-language-other]').forEach(block=>{
    block.hidden=form.querySelector(`[name="bahasa${block.dataset.languageOther}"]`)?.value!=='Lainnya';
  });
  updateEducationVisibility(form);
  form.querySelectorAll('[data-work-end]').forEach(group=>{
    const checked=form.querySelector(`[name="kerja${group.dataset.workEnd}_masih_bekerja"]`)?.checked;
    group.hidden=Boolean(checked);
  });
}
function rerenderGroups(form){
  const values=collect(form);
  const siblingValue=String(values.saudara_count??'0');
  const siblingCount=siblingValue==='3+'?3:Math.min(3,Math.max(0,Number(siblingValue)||0));
  const siblingHost=$('#siblings-rows',form);
  if(siblingHost){
    const self=`<div class="repeat-row"><div class="repeat-title">Anda (otomatis)</div>${basicGrid([
      {name:'saudara1_nama',label:'Nama',readonly:true},{name:'saudara1_lp',label:'Jenis kelamin',readonly:true},
      {name:'saudara1_umur',label:'Umur',readonly:true},{name:'saudara1_pendidikan',label:'Pendidikan',type:'select',options:educationChoices},
      {name:'saudara1_pekerjaan',label:'Pekerjaan'}
    ],{...values,saudara1_nama:values.nama||'',saudara1_lp:values.gender==='L'?'Laki-laki':values.gender==='P'?'Perempuan':'',saudara1_umur:values.umur||''})}</div>`;
    const siblings=Array.from({length:siblingCount},(_,i)=>{
      const n=i+2,p=`saudara${n}_`,fields=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:120},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
      return `<div class="repeat-row"><div class="repeat-title">Saudara ${i+1}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
    siblingHost.innerHTML=self+siblings;
  }
  const childrenHost=$('#children-rows',form);
  if(childrenHost){
    const count=Math.min(3,Math.max(0,Number(values.anak_count||0)));
    childrenHost.innerHTML=Array.from({length:count},(_,i)=>{
      const n=i+1,p=`anak${n}_`,fields=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:100},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
      return `<div class="repeat-row"><div class="repeat-title">Anak ${n}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
  }
  const languageHost=$('#language-rows',form);
  if(languageHost){
    const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0))),opts=choices(['Inggris','Mandarin','Arab','Jepang','Rusia','Jerman','Prancis','Latin','Lainnya']);
    languageHost.innerHTML=Array.from({length:count},(_,i)=>{
      const n=i+1,p=`bahasa${n}`,fields=[{name:p,label:'Bahasa asing',type:'select',options:opts},{name:p+'_bicara',label:'Berbicara',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_baca',label:'Membaca',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_tulis',label:'Menulis',type:'select',options:choices(['Dasar','Menengah','Mahir'])}];
      return `<div class="repeat-row"><div class="repeat-title">Bahasa ${n}</div>${basicGrid(fields,values)}<div class="conditional-fields" data-language-other="${n}" ${values[p]==='Lainnya'?'':'hidden'}>${fieldHtml({name:p+'_lainnya',label:'Nama bahasa lainnya'},values)}</div></div>`;
    }).join('');
  }
  const workHost=$('#work-rows',form);
  if(workHost){
    const count=Math.min(3,Math.max(0,Number(values.kerja_count||0))),months=choices(['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']);
    workHost.innerHTML=Array.from({length:count},(_,i)=>{
      const n=i+1,p=`kerja${n}_`,fields=workKeys.map(([key,label,type])=>{
        if(key.endsWith('_bulan'))return {name:p+key,label,type:'select',options:months};
        if(key.endsWith('_tahun'))return {name:p+key,label,type:'year'};
        if(type==='checkbox')return {name:p+key,label,type:'checkbox'};
        return {name:p+key,label,currency:type==='currency',type:type==='number'?'number':undefined,min:type==='number'?0:undefined,wide:['perusahaan','alasan'].includes(key)};
      });
      const endFields=fields.filter(field=>/selesai_(bulan|tahun)$/.test(field.name.slice(p.length)));
      const otherFields=fields.filter(field=>!endFields.includes(field));
      return `<div class="repeat-row"><div class="repeat-title">Pengalaman ${n}${n===1?' · terakhir':''}</div>${basicGrid(otherFields,values)}<div data-work-end="${n}">${basicGrid(endFields,values)}</div></div>`;
    }).join('');
  }
  updateDynamic(form,values);syncApplicantRow(form);updateAddressPreview(form);
}
function updateAddressPreview(form){
  const preview=$('#address-preview',form);if(!preview)return;
  const data={};for(const key of addressFields.map(f=>f.name)){const el=form.elements.namedItem(key);data[key]=el?.value||'';}
  const address=formatKtpAddress(data);
  const hidden=form.elements.namedItem('alamat_asal');if(hidden)hidden.value=address;
  preview.textContent=address;
  preview.classList.toggle('empty',!address);
}

const REGION_CACHE_DB = 'portal-karir-region-cache';
const REGION_CACHE_STORE = 'lookups';
const REGION_CACHE_VERSION = '2026-11-13-v2';
const REGION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REGION_CACHE_MAX_ENTRIES = 100;
const regionCache = new Map();
const regionInflight = new Map();
const regionFormGeneration = new WeakMap();
let regionDbPromise = null;

function openRegionCacheDb(){
  if(!('indexedDB' in window))return Promise.resolve(null);
  if(!regionDbPromise){
    regionDbPromise=new Promise(resolve=>{
      let request;
      try{request=window.indexedDB.open(REGION_CACHE_DB,1);}
      catch{resolve(null);return;}
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(REGION_CACHE_STORE))
          db.createObjectStore(REGION_CACHE_STORE,{keyPath:'key'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>resolve(null);
      request.onblocked=()=>resolve(null);
    });
  }
  return regionDbPromise;
}
async function readPersistentRegionCache(key){
  const db=await openRegionCacheDb();
  if(!db)return null;
  return new Promise(resolve=>{
    try{
      const tx=db.transaction(REGION_CACHE_STORE,'readonly');
      const request=tx.objectStore(REGION_CACHE_STORE).get(key);
      request.onsuccess=()=>{
        const entry=request.result;
        if(!entry||entry.version!==REGION_CACHE_VERSION||entry.expiresAt<=Date.now()){
          resolve(null);return;
        }
        resolve(entry.data);
      };
      request.onerror=()=>resolve(null);
      tx.onabort=()=>resolve(null);
    }catch{resolve(null);}
  });
}
async function writePersistentRegionCache(key,data){
  const db=await openRegionCacheDb();
  if(!db)return;
  return new Promise(resolve=>{
    try{
      const tx=db.transaction(REGION_CACHE_STORE,'readwrite');
      const store=tx.objectStore(REGION_CACHE_STORE);
      const now=Date.now();
      store.put({key,version:REGION_CACHE_VERSION,createdAt:now,expiresAt:now+REGION_CACHE_TTL_MS,data});
      const all=store.getAll();
      all.onsuccess=()=>{
        const entries=all.result||[];
        const valid=entries.filter(entry=>entry.version===REGION_CACHE_VERSION&&entry.expiresAt>now)
          .sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
        for(const entry of entries){
          if(entry.version!==REGION_CACHE_VERSION||entry.expiresAt<=now)store.delete(entry.key);
        }
        while(valid.length>REGION_CACHE_MAX_ENTRIES){
          const oldest=valid.shift();
          if(oldest.key!==key)store.delete(oldest.key);
        }
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>resolve();
      tx.onabort=()=>resolve();
    }catch{resolve();}
  });
}
function rememberRegionResult(key,data){
  regionCache.set(key,{data,expiresAt:Date.now()+REGION_CACHE_TTL_MS});
  while(regionCache.size>REGION_CACHE_MAX_ENTRIES){
    regionCache.delete(regionCache.keys().next().value);
  }
}
async function regionRpc(name,params={}){
  const key=REGION_CACHE_VERSION+':'+name+':'+JSON.stringify(params);
  const cached=regionCache.get(key);
  if(cached&&cached.expiresAt>Date.now())return cached.data;
  if(cached)regionCache.delete(key);
  if(regionInflight.has(key))return regionInflight.get(key);

  const request=(async()=>{
    const persistent=await readPersistentRegionCache(key);
    if(persistent!==null){
      rememberRegionResult(key,persistent);
      return persistent;
    }
    const {data,error}=await supabase.rpc(name,params);
    if(error)throw error;
    const rows=data||[];
    rememberRegionResult(key,rows);
    writePersistentRegionCache(key,rows).catch(()=>{});
    return rows;
  })();
  regionInflight.set(key,request);
  try{return await request;}
  finally{if(regionInflight.get(key)===request)regionInflight.delete(key);}
}
function beginRegionGeneration(form){
  const next=(regionFormGeneration.get(form)||0)+1;
  regionFormGeneration.set(form,next);
  return next;
}
function currentRegionGeneration(form){return regionFormGeneration.get(form)||0;}
function isCurrentRegionGeneration(form,generation){
  return regionFormGeneration.get(form)===generation;
}
function setSelect(select,rows,placeholder){
  if(!select)return;
  const selected=select.value;
  select.innerHTML='<option value="">'+esc(placeholder||'Pilih')+'</option>'+rows.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.name)+'</option>').join('');
  if(rows.some(row=>String(row.id)===selected))select.value=selected;
}
function regionNormalize(value){
  return String(value||'').toLocaleUpperCase('id-ID').replace(/\b(PROVINSI|KABUPATEN|KAB\.?|KOTA ADMINISTRASI|KOTA)\b/g,' ').replace(/[^A-Z0-9]/g,'').trim();
}
function setAddressLabel(form,name,value){
  const el=form.querySelector('[name="'+name+'"]');if(el)el.value=value||'';
}
function setVillageAddress(form,village){
  setAddressLabel(form,'alamat_desa',village?.name||'');
  setAddressLabel(form,'alamat_wilayah_type',village?.area_type||'');
  const postal=form.querySelector('[name="alamat_kodepos"]');
  if(postal)postal.value=village?.postal_code||'';
}
function findRegion(rows,value){
  const wanted=regionNormalize(value);
  return rows.find(row=>regionNormalize(row.name)===wanted)||rows.find(row=>wanted&&(regionNormalize(row.name).includes(wanted)||wanted.includes(regionNormalize(row.name))));
}
async function loadProvinces(form,generation=currentRegionGeneration(form)){
  const rows=await regionRpc('list_region_provinces');
  if(isCurrentRegionGeneration(form,generation))
    setSelect(form.querySelector('[name="alamat_provinsi_id"]'),rows,'Pilih provinsi');
  return rows;
}
async function loadRegencies(form,provinceId,generation=currentRegionGeneration(form)){
  const rows=provinceId?await regionRpc('list_region_regencies',{p_province_id:provinceId}):[];
  const currentProvince=form.querySelector('[name="alamat_provinsi_id"]')?.value||'';
  if(isCurrentRegionGeneration(form,generation)&&currentProvince===provinceId){
    setSelect(form.querySelector('[name="alamat_kota_id"]'),rows,'Pilih kabupaten / kota');
    const el=form.querySelector('[name="alamat_kota_id"]');if(el)el.disabled=!provinceId;
  }
  return rows;
}
async function loadDistricts(form,regencyId,generation=currentRegionGeneration(form)){
  const rows=regencyId?await regionRpc('list_region_districts',{p_regency_id:regencyId}):[];
  const currentRegency=form.querySelector('[name="alamat_kota_id"]')?.value||'';
  if(isCurrentRegionGeneration(form,generation)&&currentRegency===regencyId){
    setSelect(form.querySelector('[name="alamat_kecamatan_id"]'),rows,'Pilih kecamatan');
    const el=form.querySelector('[name="alamat_kecamatan_id"]');if(el)el.disabled=!regencyId;
  }
  return rows;
}
async function loadVillages(form,districtId,search='',generation=currentRegionGeneration(form)){
  const rows=districtId?await regionRpc('list_region_villages_with_postal_code',{
    p_district_id:districtId,p_search:search||null,p_limit:30
  }):[];
  const currentDistrict=form.querySelector('[name="alamat_kecamatan_id"]')?.value||'';
  const select=form.querySelector('[name="alamat_desa_id"]');
  if(select&&isCurrentRegionGeneration(form,generation)&&currentDistrict===districtId){
    const previous=select.value;
    select.innerHTML='<option value="">Pilih desa / kelurahan</option>'+rows.map(row=>
      '<option value="'+esc(row.id)+'" data-area-type="'+esc(row.area_type||'Desa')+'" data-postal-code="'+esc(row.postal_code||'')+'">'+esc(row.name)+'</option>'
    ).join('');
    const stillSelected=rows.some(row=>String(row.id)===previous);
    if(stillSelected)select.value=previous;
    else if(previous)setVillageAddress(form,null);
    select.disabled=!districtId;
  }
  return rows;
}
async function hydrateAddress(form,values={}){
  const generation=beginRegionGeneration(form);
  const provinceSelect=form.querySelector('[name="alamat_provinsi_id"]');
  const regencySelect=form.querySelector('[name="alamat_kota_id"]');
  const districtSelect=form.querySelector('[name="alamat_kecamatan_id"]');
  const villageSelect=form.querySelector('[name="alamat_desa_id"]');
  for(const select of [regencySelect,districtSelect,villageSelect])if(select)select.disabled=true;

  const provinces=await loadProvinces(form,generation);
  if(!isCurrentRegionGeneration(form,generation))return;
  const province=findRegion(provinces,values.alamat_provinsi);
  if(!province){
    await loadRegencies(form,'',generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    await loadDistricts(form,'',generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    await loadVillages(form,'','',generation);
    return;
  }
  provinceSelect.value=province.id;
  setAddressLabel(form,'alamat_provinsi',province.name);

  const regencies=await loadRegencies(form,province.id,generation);
  if(!isCurrentRegionGeneration(form,generation))return;
  const regency=findRegion(regencies,values.alamat_kota_nama);
  if(!regency){
    await loadDistricts(form,'',generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    await loadVillages(form,'','',generation);
    return;
  }
  regencySelect.value=regency.id;
  const cityMatch=regency.name.match(/^(Kabupaten|Kota)\s+/i);
  setAddressLabel(form,'alamat_kota_jenis',cityMatch?.[1]||'Kabupaten');
  setAddressLabel(form,'alamat_kota_nama',regency.name.replace(/^(Kabupaten|Kota)\s+/i,''));

  const districts=await loadDistricts(form,regency.id,generation);
  if(!isCurrentRegionGeneration(form,generation))return;
  const district=findRegion(districts,values.alamat_kecamatan);
  if(!district){
    await loadVillages(form,'','',generation);
    return;
  }
  districtSelect.value=district.id;
  setAddressLabel(form,'alamat_kecamatan',district.name);

  const villageSearch=String(values.alamat_desa||'').trim().replace(/[.,;]+$/,'');
  let villages=await loadVillages(form,district.id,villageSearch,generation);
  if(!isCurrentRegionGeneration(form,generation))return;
  let village=findRegion(villages,values.alamat_desa);
  if(!village&&villageSearch.length>3){
    villages=await loadVillages(form,district.id,villageSearch.slice(0,3),generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    village=findRegion(villages,values.alamat_desa);
  }
  if(village){
    villageSelect.value=village.id;
    setVillageAddress(form,village);
  }else setVillageAddress(form,null);
  updateAddressPreview(form);
}
async function onRegionChange(form,name){
  const generation=beginRegionGeneration(form);
  if(name!=='alamat_desa_id')clearTimeout(villageSearchTimer);
  const value=form.querySelector('[name="'+name+'"]')?.value||'';
  if(name==='alamat_provinsi_id'){
    const rows=await loadProvinces(form,generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    const row=rows.find(item=>item.id===value);
    setAddressLabel(form,'alamat_provinsi',row?.name||'');
    for(const key of ['alamat_kota_jenis','alamat_kota_nama','alamat_kecamatan','alamat_desa','alamat_wilayah_type','alamat_kodepos'])setAddressLabel(form,key,'');
    for(const field of ['alamat_kota_id','alamat_kecamatan_id','alamat_desa_id']){
      const el=form.querySelector('[name="'+field+'"]');if(el)el.value='';
    }
    await loadRegencies(form,value,generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    await loadDistricts(form,'',generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    await loadVillages(form,'','',generation);
  }else if(name==='alamat_kota_id'){
    const provinceId=form.querySelector('[name="alamat_provinsi_id"]')?.value||'';
    const rows=await loadRegencies(form,provinceId,generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    const row=rows.find(item=>item.id===value);
    const match=row?.name.match(/^(Kabupaten|Kota)\s+/i);
    setAddressLabel(form,'alamat_kota_jenis',match?.[1]||'');
    setAddressLabel(form,'alamat_kota_nama',row?.name.replace(/^(Kabupaten|Kota)\s+/i,'')||'');
    for(const key of ['alamat_kecamatan','alamat_desa','alamat_wilayah_type','alamat_kodepos'])setAddressLabel(form,key,'');
    for(const field of ['alamat_kecamatan_id','alamat_desa_id']){
      const el=form.querySelector('[name="'+field+'"]');if(el)el.value='';
    }
    await loadDistricts(form,value,generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    await loadVillages(form,'','',generation);
  }else if(name==='alamat_kecamatan_id'){
    const regencyId=form.querySelector('[name="alamat_kota_id"]')?.value||'';
    const rows=await loadDistricts(form,regencyId,generation);
    if(!isCurrentRegionGeneration(form,generation))return;
    const row=rows.find(item=>item.id===value);
    setAddressLabel(form,'alamat_kecamatan',row?.name||'');
    for(const key of ['alamat_desa','alamat_wilayah_type','alamat_kodepos'])setAddressLabel(form,key,'');
    const village=form.querySelector('[name="alamat_desa_id"]');if(village)village.value='';
    await loadVillages(form,value,'',generation);
  }else if(name==='alamat_desa_id'){
    const select=form.querySelector('[name="alamat_desa_id"]');
    const option=select?.selectedOptions?.[0];
    if(option?.value){
      setVillageAddress(form,{
        name:option.textContent,
        area_type:option.dataset.areaType||'Desa',
        postal_code:option.dataset.postalCode||''
      });
    }else setVillageAddress(form,null);
  }
  updateAddressPreview(form);queueDraftSave(form);
}
function setWizardStep(step,{push=false,replace=false}={}){
  activeStep=Math.max(0,Math.min(stepNames.length-1,step));
  $$('.form-step',root).forEach(el=>el.hidden=Number(el.dataset.formStep)!==activeStep);
  $('#wizard-count',root).textContent=`${String(activeStep+1).padStart(2,'0')} / 05`;
  $('#wizard-step-label',root).textContent=stepNames[activeStep];
  $('#wizard-progress-bar',root).style.width=`${(activeStep+1)/stepNames.length*100}%`;
  $('#wizard-prev',root).disabled=activeStep===0;
  $('#wizard-next',root).textContent=activeStep===stepNames.length-1?'Kirim lamaran':'Lanjut';
  if(push){try{history.pushState({portalForm:true,step:activeStep},'',location.href);}catch{}}
  else if(replace){try{history.replaceState({portalForm:true,step:activeStep},'',location.href);}catch{}}
  const form=$('#application-form');if(form)queueDraftSave(form);
  window.scrollTo({top:0,behavior:'smooth'});
}
function saveState(message,failed=false){
  const el=$('#draft-save-state');if(!el)return;
  el.textContent=message;el.classList.toggle('failed',failed);
}
function localDraftKey(token=draftToken){return `${LOCAL_DRAFT_PREFIX}${token}`;}
function readLocalDraft(token=draftToken){
  if(!token)return null;
  try{
    const raw=localStorage.getItem(localDraftKey(token)) || localStorage.getItem(`${LEGACY_LOCAL_DRAFT_PREFIX}${token}`);
    return raw?JSON.parse(raw):null;
  }catch{return null;}
}
function writeLocalDraft(form){
  if(!draftToken||!form)return;
  const data={...collect(form),__form_step:activeStep,__saved_at:Date.now(),__cv_filename:cvFilename||''};
  try{localStorage.setItem(localDraftKey(),JSON.stringify(data));}catch(error){console.warn('Local draft unavailable',error);}
  storeCandidateToken(draftToken);
}
function writeLocalInitialDraft(data={}){
  if(!draftToken)return;
  const payload={...data,__form_step:Number(data.__form_step||0),__saved_at:Date.now(),__cv_filename:cvFilename||data.__cv_filename||''};
  try{localStorage.setItem(localDraftKey(),JSON.stringify(payload));}catch{}
}
async function saveDraftRemote(form){
  if(!draftToken||!isConfigured)return;
  const data={...collect(form),__form_step:activeStep,__saved_at:Date.now()};
  const {error}=await supabase.rpc('save_candidate_draft',{p_access_token:draftToken,p_data:data,p_cv_filename:cvFilename||null});
  if(error)throw error;
  saveState('Tersimpan');
}
function queueDraftSave(form){
  writeLocalDraft(form);
  saveState('Tersimpan di perangkat');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    saveInFlight=saveInFlight.then(()=>saveDraftRemote(form)).catch(error=>{
      console.error('Draft save failed',error);saveState('Tersimpan di perangkat',true);
    });
  },350);
}
async function flushDraft(form){
  writeLocalDraft(form);
  clearTimeout(saveTimer);
  saveInFlight=saveInFlight.then(()=>saveDraftRemote(form));
  await saveInFlight;
}
function normalizeDigitInput(el,max){
  const digits=el.value.replace(/\D/g,'').slice(0,max);
  el.value=digits;
}
function padRtRw(el){
  const digits=String(el.value||'').replace(/\D/g,'').slice(0,3);
  el.value=digits?digits.padStart(3,'0'):'';
}
function sanitizeFinalData(data){
  const result={...data};
  if(result.status_kawin!=='Kawin')for(const key of Object.keys(result))if(key.startsWith('pasangan_'))delete result[key];
  if(!result.status_kawin||result.status_kawin==='Belum kawin')for(const key of Object.keys(result))if(key.startsWith('anak'))delete result[key];
  if(String(result.domisili_berbeda)!=='true')result.domisili=result.alamat_asal||'';
  delete result.domisili_berbeda;
  delete result.alamat_desa_search;
  delete result.referensi_count;
  for(const key of Object.keys(result))if(key.startsWith('referensi'))delete result[key];
  delete result.__saved_at;delete result.__cv_filename;
  return result;
}
function formatCurrencyInput(el){
  const before=el.value,position=el.selectionStart??before.length,digitsBefore=before.slice(0,position).replace(/\D/g,'').length;
  const digits=before.replace(/\D/g,'');el.value=digits?new Intl.NumberFormat('id-ID').format(Number(digits)):'';
  let pos=0,seen=0;while(pos<el.value.length&&seen<digitsBefore){if(/\d/.test(el.value[pos]))seen++;pos++;}
  try{el.setSelectionRange(pos,pos);}catch{}
}
function validateCurrentStep(form){
  const step=$(`[data-form-step="${activeStep}"]`,form);
  for(const el of $$('input,select,textarea',step)){
    if(!el.required||el.disabled||el.closest('[data-conditional="true"][hidden]'))continue;
    if(!el.checkValidity()){el.reportValidity();el.focus({preventScroll:false});return false;}
  }
  return true;
}
function validateWholeForm(form){
  for(const el of $$('input,select,textarea',form)){
    if(!el.required||el.disabled||el.type==='file'||el.closest('[data-conditional="true"][hidden]'))continue;
    if(!el.checkValidity()){
      const step=el.closest('[data-form-step]');if(step)setWizardStep(Number(step.dataset.formStep));
      requestAnimationFrame(()=>{el.reportValidity();el.focus({preventScroll:false});});return false;
    }
  }
  return true;
}

function stopCamera(){
  if(mediaStream){mediaStream.getTracks().forEach(track=>track.stop());mediaStream=null;}
}
function cameraCropCanvas(){
  const video=$('#ktp-video'),container=$('#ktp-camera-frame'),guide=$('#ktp-guide');
  if(!video?.videoWidth||!container||!guide)throw new Error('Kamera belum siap.');
  const box=container.getBoundingClientRect(),frame=guide.getBoundingClientRect();
  const scale=Math.max(box.width/video.videoWidth,box.height/video.videoHeight);
  const renderedW=video.videoWidth*scale,renderedH=video.videoHeight*scale;
  const offsetX=(box.width-renderedW)/2,offsetY=(box.height-renderedH)/2;
  const sx=Math.max(0,(frame.left-box.left-offsetX)/scale),sy=Math.max(0,(frame.top-box.top-offsetY)/scale);
  const sw=Math.min(video.videoWidth-sx,frame.width/scale),sh=Math.min(video.videoHeight-sy,frame.height/scale);
  if(sw<80||sh<50)throw new Error('Posisi KTP belum masuk bingkai.');
  const canvas=document.createElement('canvas'),factor=Math.min(2,1800/sw);
  canvas.width=Math.round(sw*factor);canvas.height=Math.round(sh*factor);
  canvas.getContext('2d',{willReadFrequently:true}).drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  enhanceForOcr(canvas);return canvas;
}
function enhanceForOcr(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.getImageData(0,0,canvas.width,canvas.height),d=image.data;
  for(let i=0;i<d.length;i+=4){
    const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2],contrast=Math.max(0,Math.min(255,(gray-118)*1.38+128));
    d[i]=d[i+1]=d[i+2]=contrast;
  }
  ctx.putImageData(image,0,0);
}
function canvasToJpeg(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Foto KTP tidak dapat disiapkan.')),'image/jpeg',0.9));
}
async function ensureKtpDraft(){
  if(!draftToken)draftToken=newCandidateToken();
  const {error}=await supabase.rpc('save_candidate_draft',{
    p_access_token:draftToken,p_data:{...initialData},p_cv_filename:cvFilename||null
  });
  if(error)throw error;
}
async function saveKtpPhoto(blob){
  if(blob.size>MAX_KTP_BYTES)throw new Error('Ukuran foto KTP maksimal 8 MB.');
  await ensureKtpDraft();
  const path=`${KTP_PATH_PREFIX}/${draftToken}/ktp.jpg`;
  const {error}=await supabase.storage.from(KTP_BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:true});
  if(error)throw error;
  initialData.ktp_path=path;
  writeLocalInitialDraft(initialData);
  const {error:draftError}=await supabase.rpc('save_candidate_draft',{
    p_access_token:draftToken,p_data:{...initialData},p_cv_filename:cvFilename||null
  });
  if(draftError)throw draftError;
  return path;
}
async function requestBrowserOcr(canvas,status){
  const createWorker=window.Tesseract?.createWorker;
  if(typeof createWorker!=='function'){
    throw new Error('Mesin OCR perangkat belum dapat dimuat. Foto KTP tetap tersimpan; silakan coba kembali atau isi manual setelah tiga percobaan.');
  }
  if(status)status.textContent='OCR berjalan sepenuhnya di perangkat ini…';
  let worker=null,expired=false,terminated=false,timeoutId=null;
  const terminateWorker=async()=>{
    if(!worker||terminated)return;
    terminated=true;
    try{await worker.terminate();}catch{}
  };
  const recognition=(async()=>{
    const instance=await createWorker('ind+eng',1,{logger:m=>{
      if(m.status==='recognizing text'&&status)status.textContent=`OCR di perangkat: membaca ${Math.round((m.progress||0)*100)}%`;
    }});
    worker=instance;
    if(expired){await terminateWorker();throw new Error('OCR perangkat melewati batas 25 detik.');}
    return await instance.recognize(canvas);
  })();
  const timeout=new Promise((_,reject)=>{
    timeoutId=setTimeout(()=>{
      expired=true;
      void terminateWorker();
      reject(new Error('OCR perangkat melewati batas 25 detik. Ambil foto ulang atau isi manual setelah tiga percobaan.'));
    },25000);
  });
  try{
    const result=await Promise.race([recognition,timeout]);
    return extractKtpText(result.data?.text||'');
  }finally{
    clearTimeout(timeoutId);
    await terminateWorker();
  }
}
function hasUsefulOcr(data){
  const nik=String(data?.nik||'').replace(/\D/g,'');
  return /^\d{16}$/.test(nik)||Boolean(data?.nama&& (data?.tanggal_lahir||data?.tempat_lahir||data?.alamat_jalan));
}
async function processKtpCanvas(canvas){
  const status=$('#ocr-status');
  if(ocrAttempts>=MAX_OCR_ATTEMPTS){
    if(status)status.textContent='Tiga percobaan OCR telah digunakan. Isi data secara manual; foto KTP sudah tersimpan.';
    const manual=$('#manual-entry');if(manual)manual.hidden=!ktpPath;
    return;
  }
  try{
    if(status)status.textContent='Menyimpan foto KTP secara privat…';
    const blob=await canvasToJpeg(canvas);
    const path=await saveKtpPhoto(blob);
    ktpPath=path;
    ocrAttempts+=1;
    if(status)status.textContent=`Foto KTP tersimpan · percobaan OCR ${ocrAttempts}/3…`;
    const parsed=await requestBrowserOcr(canvas,status);
    if(!hasUsefulOcr(parsed))throw new Error('Data KTP belum cukup terbaca. Pastikan foto fokus dan tidak silau.');
    initialData={...initialData,...parsed,ktp_path:path};
    writeLocalInitialDraft(initialData);
    stopCamera();
    showForm();
  }catch(error){
    if(status){
      status.textContent=ocrAttempts>=MAX_OCR_ATTEMPTS
        ? `Tiga percobaan OCR selesai. ${error?.message||'KTP belum terbaca.'} Anda dapat mengisi data secara manual; foto tetap tersimpan.`
        : `Percobaan ${ocrAttempts}/3 belum berhasil. ${error?.message||'Silakan ambil foto ulang.'}`;
    }
    const manual=$('#manual-entry');
    if(manual)manual.hidden=!(ocrAttempts>=MAX_OCR_ATTEMPTS&&ktpPath);
    const capture=$('#capture-ktp');
    if(capture&&ocrAttempts>=MAX_OCR_ATTEMPTS){capture.disabled=true;capture.textContent='Batas OCR tercapai';}
    throw error;
  }
}

async function startCamera(){
  const video=$('#ktp-video'),status=$('#camera-status'),fallback=$('#ktp-fallback');
  if(!navigator.mediaDevices?.getUserMedia){
    cameraFallback=true;fallback.hidden=false;
    if(status)status.textContent='Kamera langsung tidak tersedia. Gunakan kamera ponsel untuk mengambil foto.';
    return;
  }
  try{
    mediaStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},focusMode:{ideal:'continuous'}}});
    video.srcObject=mediaStream;await video.play();$('#capture-ktp').disabled=false;
    if(status)status.textContent='';
  }catch(error){
    cameraFallback=true;fallback.hidden=false;$('#capture-ktp').disabled=true;
    if(status)status.textContent='Izinkan akses kamera atau gunakan kamera ponsel.';
  }
}
async function processPhotoFile(file){
  if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){
    const status=$('#ocr-status');if(status)status.textContent='Format foto harus JPG, PNG, atau WebP.';
    return;
  }
  if(file.size>8*1024*1024){
    const status=$('#ocr-status');if(status)status.textContent='Ukuran foto maksimal 8 MB.';
    return;
  }
  const status=$('#ocr-status');
  try{
    if(status)status.textContent='Menyiapkan foto KTP…';
    const bitmap=await createImageBitmap(file);
    try{
      const ratio=1.586;
      const sw=Math.min(bitmap.width,bitmap.height*ratio),sh=sw/ratio;
      const sx=(bitmap.width-sw)/2,sy=(bitmap.height-sh)/2;
      const canvas=document.createElement('canvas');
      canvas.width=1800;canvas.height=Math.round(1800/ratio);
      canvas.getContext('2d').drawImage(bitmap,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
      enhanceForOcr(canvas);
      await processKtpCanvas(canvas);
    }finally{bitmap.close?.();}
  }catch(error){
    if(status&&ocrAttempts<MAX_OCR_ATTEMPTS)status.textContent=error.message||'KTP belum terbaca.';
  }
}
function showKtpScreen(){
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">PORTAL KARIR</span><span class="step-number">IDENTITAS</span></div><div class="wizard-progress"><span style="width:8%"></span></div><section class="candidate-card ktp-card"><h1 class="candidate-title">Pindai KTP</h1><p class="candidate-sub">Posisikan KTP di dalam bingkai. Foto disimpan secara privat untuk verifikasi HR.</p><div class="ktp-camera-frame" id="ktp-camera-frame"><video id="ktp-video" autoplay muted playsinline></video><div class="ktp-guide" id="ktp-guide"><span>POSISIKAN KTP</span></div><div class="ktp-camera-corners" aria-hidden="true"></div></div><div class="ocr-status" id="ocr-status" aria-live="polite"></div><div class="camera-status" id="camera-status"></div><div id="ktp-fallback" class="ktp-fallback"><button type="button" class="btn btn-secondary full" id="open-phone-camera">Ambil / pilih foto KTP</button></div><input type="file" id="ktp-fallback-input" accept="image/jpeg,image/png,image/webp" capture="environment" hidden><div class="candidate-actions camera-actions"><button type="button" class="btn btn-primary" id="capture-ktp" disabled>Ambil foto KTP</button></div><button type="button" class="manual-entry" id="manual-entry" hidden>Isi data manual (foto KTP tetap tersimpan)</button></section>`;
  startCamera();
  $('#capture-ktp').addEventListener('click',async()=>{
    const button=$('#capture-ktp');setBusy(button,true,'Menyimpan & membaca…');
    try{await processKtpCanvas(cameraCropCanvas());}
    catch(error){if($('#ocr-status')&&ocrAttempts<MAX_OCR_ATTEMPTS)$('#ocr-status').textContent=error.message||'Foto gagal diproses.';}
    finally{if($('#capture-ktp'))setBusy($('#capture-ktp'),false);}
  });
  $('#open-phone-camera').addEventListener('click',()=>$('#ktp-fallback-input').click());
  $('#ktp-fallback-input').addEventListener('change',event=>processPhotoFile(event.target.files?.[0]));
  $('#manual-entry').addEventListener('click',()=>{
    if(!ktpPath){const status=$('#ocr-status');if(status)status.textContent='Simpan foto KTP terlebih dahulu.';return;}
    writeLocalInitialDraft({...initialData,ktp_path:ktpPath});
    showForm();
  });
}

async function uploadCv(file){
  const status=$('#cv-upload-state'),name=$('#cv-filename');
  if(!file)return;
  if(file.size>MAX_CV_BYTES){status.textContent='Ukuran CV maksimal 10 MB.';return;}
  const signature=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
  if(signature!=='%PDF-'){status.textContent='File harus PDF.';return;}
  status.textContent='Mengunggah…';
  const form=$('#application-form');
  try{
    await flushDraft(form);
    const path=`${CV_PATH_PREFIX}/${draftToken}/cv.pdf`;
    const {error}=await supabase.storage.from(CV_BUCKET).upload(path,file,{contentType:'application/pdf',upsert:true});
    if(error)throw error;
    cvFilename=file.name;
    name.textContent=cvFilename;
    status.textContent='CV berhasil diunggah dan tersimpan.';
    const prompt=$('#cv-disc-prompt');if(prompt)prompt.hidden=false;
    await flushDraft(form);
  }catch(error){
    status.textContent=error.message||'CV belum tersimpan.';saveState('Belum tersimpan',true);
  }
}
function showForm(){
  stopCamera();
  ktpPath=initialData.ktp_path||ktpPath||'';
  root.innerHTML=renderForm(initialData);
  const form=$('#application-form');
  $('#cv-filename').textContent=cvFilename||'Unggah CV (PDF)';
  $('#cv-upload-state').textContent=cvFilename?'CV berhasil tersimpan.':'';
  const cvPrompt=$('#cv-disc-prompt');if(cvPrompt)cvPrompt.hidden=!cvFilename;
  $('#cv-continue-submit')?.addEventListener('click',()=>$('#wizard-next')?.click());
  $('#cv-do-later')?.addEventListener('click',()=>{if(cvPrompt)cvPrompt.hidden=true;});
  const numericFields=['nik','alamat_rt','alamat_rw'];
  form.addEventListener('input',event=>{
    const el=event.target;
    if(numericFields.includes(el.name))normalizeDigitInput(el,el.name==='nik'?16:3);
    if(el.name==='telepon'||el.name==='kontak_darurat_telepon')normalizeDigitInput(el,16);
    if(el.dataset.formatNumber==='idr')formatCurrencyInput(el);
    if(['nama','tanggal_lahir','gender'].includes(el.name))syncApplicantRow(form);
    if(addressFields.some(field=>field.name===el.name))updateAddressPreview(form);
    if(el.name==='alamat_desa_search'){
      clearTimeout(villageSearchTimer);
      villageSearchTimer=setTimeout(()=>{
        const districtId=form.querySelector('[name="alamat_kecamatan_id"]')?.value||'';
        const term=el.value.trim();
        if(districtId&&(term.length>=2||term.length===0)){
          const generation=beginRegionGeneration(form);
          loadVillages(form,districtId,term,generation).catch(error=>saveState(error.message||'Daftar desa gagal dimuat.',true));
        }
      },280);
    }
    queueDraftSave(form);
  });
  form.addEventListener('change',event=>{
    const key=event.target.name;
    if(['alamat_provinsi_id','alamat_kota_id','alamat_kecamatan_id','alamat_desa_id'].includes(key)){
      onRegionChange(form,key).catch(error=>saveState(error.message||'Wilayah gagal dimuat.',true));
      return;
    }
    if(['alamat_rt','alamat_rw'].includes(key))padRtRw(event.target);
    if(['saudara_count','anak_count','bahasa_count','kerja_count'].includes(key))rerenderGroups(form);
    else if(key==='status_kawin'||key==='domisili_berbeda'||key==='pendidikan_terakhir'||/^bahasa[1-4]$/.test(key)||/_masih_bekerja$/.test(key)){
      updateDynamic(form,collect(form));
    }
    syncApplicantRow(form);updateAddressPreview(form);queueDraftSave(form);
  });
  $('#cv-file',form).addEventListener('change',event=>uploadCv(event.target.files?.[0]));
  $('#wizard-prev').addEventListener('click',()=>{if(activeStep>0)setWizardStep(activeStep-1,{replace:true});});
  $('#wizard-next').addEventListener('click',async()=>{
    const error=$('#form-error');error.textContent='';
    if(!validateCurrentStep(form))return;
    if(activeStep<stepNames.length-1){setWizardStep(activeStep+1,{push:true});return;}
    if(!cvFilename){error.textContent='Unggah CV dalam format PDF.';return;}
    const ktpPathValue=form.querySelector('[name="ktp_path"]')?.value||initialData.ktp_path||ktpPath;
    if(!ktpPathValue){error.textContent='Foto KTP belum tersimpan. Silakan ulangi proses foto KTP.';return;}
    if(!validateWholeForm(form))return;
    await submitApplication(form);
  });
  rerenderGroups(form);
  setWizardStep(activeStep);
  queueDraftSave(form);
  history.replaceState({portalForm:true,step:activeStep,root:true},'',location.href);
  history.pushState({portalForm:true,step:activeStep,root:false},'',location.href);
  writeLocalDraft(form);
  hydrateAddress(form,initialData).catch(error=>saveState(error.message||'Daftar wilayah gagal dimuat.',true));
  updateAddressPreview(form);
}
function showExisting(ctx){
  if(ctx.disc_completed||ctx.stage==='disc_completed'){
    root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Tes DISC selesai</h1><p>${esc(ctx.full_name||'')}</p></section>`;return;
  }
  root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Lamaran berhasil dikirim!</h1><p>${esc(ctx.full_name||'')}, data lamaran Anda sudah tersimpan.</p>
    <a class="btn btn-primary full" href="${esc(stageUrl(3))}">Lanjutkan Test DISC Sekarang</a>
    <button type="button" class="btn btn-secondary full" id="disc-later" style="margin-top:10px">Test DISC Nanti</button>
    <p id="disc-later-note" class="candidate-sub" hidden>Silakan kembali ke halaman formulir dari perangkat dan browser yang sama untuk melanjutkan Test DISC. Sesi kandidat tersimpan di perangkat ini.</p>
  </section>`;
  $('#disc-later')?.addEventListener('click',()=>{
    const note=$('#disc-later-note');if(note)note.hidden=false;
    const button=$('#disc-later');if(button){button.textContent='Pilihan disimpan';button.disabled=true;}
  });
}
async function submitApplication(form){
  const error=$('#form-error'),button=$('#wizard-next');
  error.textContent='';
  if(!isConfigured){error.textContent='Server belum terhubung.';return;}
  const data=sanitizeFinalData(collect(form));
  if(!/^\d{16}$/.test(String(data.nik||''))){setWizardStep(0);error.textContent='NIK harus terdiri dari 16 angka.';return;}
  if(!data.nama){setWizardStep(0);error.textContent='Nama lengkap wajib diisi.';return;}
  if(!data.ktp_path){error.textContent='Foto KTP belum tersimpan. Silakan kembali ke proses foto KTP.';return;}
  if(!draftToken)draftToken=newCandidateToken();
  setBusy(button,true,'Mengirim…');
  try{
    await flushDraft(form);
    const path=`${CV_PATH_PREFIX}/${draftToken}/cv.pdf`;
    const {error:submitError}=await supabase.rpc('submit_candidate_application',{p_access_token:draftToken,p_data:data,p_cv_path:path});
    if(submitError)throw submitError;
    storeCandidateToken(draftToken);
    try{localStorage.removeItem(localDraftKey());}catch{}
    showExisting({full_name:data.nama,stage:'application_submitted'});
  }catch(err){
    error.textContent=err.message||'Lamaran belum berhasil dikirim.';setBusy(button,false);
  }
}
async function loadExistingCandidate(token){
  const {data,error}=await supabase.rpc('get_candidate_context',{p_access_token:token});
  if(error)throw error;
  if(data){showExisting(data);return true;}
  return false;
}
async function loadDraft(token){
  const {data,error}=await supabase.rpc('get_candidate_draft',{p_access_token:token});
  if(error)throw error;
  if(!data)return null;
  return data;
}
async function init(){
  draftToken=candidateToken()||newCandidateToken();
  // Local storage is the immediate recovery layer. It must work even when
  // Supabase is temporarily offline or has not yet been configured.
  const localDraft=readLocalDraft(draftToken);
  let existing=null,remoteDraft=null,remoteError=null;
  if(isConfigured){
    try{existing=await loadExistingCandidate(draftToken);}catch(error){remoteError=error;}
    if(existing)return;
    try{remoteDraft=await loadDraft(draftToken);}catch(error){remoteError=error;}
  }
  if(remoteDraft || localDraft){
    const remoteData=remoteDraft?.draft_data||{};
    const localData=localDraft||{};
    const localTime=Number(localData.__saved_at||0);
    const remoteTime=remoteDraft?.updated_at?new Date(remoteDraft.updated_at).getTime():0;
    initialData=localTime>=remoteTime?{...remoteData,...localData}:{...localData,...remoteData};
    cvFilename=localData.__cv_filename||remoteDraft?.cv_filename||'';
    showForm();
    if(!isConfigured || remoteError) saveState('Draf dipulihkan dari perangkat',true);
    return;
  }
  if(!isConfigured){
    root.innerHTML='<section class="candidate-card"><h1 class="candidate-title">Portal Karir</h1><p class="candidate-sub">Server belum terhubung.</p></section>';return;
  }
  if(remoteError) throw remoteError;
  showKtpScreen();
}
window.addEventListener('popstate',event=>{
  const form=$('#application-form');if(!form)return;
  if(event.state?.portalForm){
    setWizardStep(Number(event.state.step||0));
    // The root state is the final in-form back stop. A further back may leave
    // the page, but the draft is durable and will be restored on return.
  }else if(location.pathname.replace(/\/+$/,'').endsWith('/form')){
    // One accidental browser-back press stays on the form. A further back may
    // leave the page, but every keystroke is already in localStorage/Supabase.
    setWizardStep(activeStep);history.pushState({portalForm:true,step:activeStep,root:false},'',location.href);
  }
});
window.addEventListener('pagehide',()=>{
  const form=$('#application-form');if(form)writeLocalDraft(form);
  stopCamera();
});
document.addEventListener('visibilitychange',()=>{
  const form=$('#application-form');if(document.visibilityState==='hidden'&&form){writeLocalDraft(form);flushDraft(form).catch(()=>{});}
});
init().catch(error=>{
  stopCamera();root.innerHTML=`<section class="candidate-card"><h1 class="candidate-title">Portal Karir</h1><p class="candidate-sub">${esc(error.message||'Formulir belum dapat dimuat.')}</p></section>`;
});
