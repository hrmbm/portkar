import { supabase, isConfigured } from './supabase.js';
import { MAX_CV_BYTES, CV_BUCKET, CV_PATH_PREFIX } from './config.js';
import { $, esc, ageFrom, candidateToken, newCandidateToken, storeCandidateToken, stageUrl, setBusy } from './common.js';
import { extractKtpText, formatKtpAddress } from './ktp-ocr.js';

const root = $('#candidate-app');
const choices = items => items.map(value => ({value,label:value}));
const educationChoices = choices(['Tidak sekolah','SD / Sederajat','SMP / Sederajat','SMA / SMK','D1','D2','D3','D4','S1','S2','S3']);
const religionChoices = choices(['Islam','Kristen Protestan','Katolik','Hindu','Buddha','Konghucu','Kepercayaan','Lainnya']);
const provinceChoices = choices(['Aceh','Sumatera Utara','Sumatera Barat','Riau','Kepulauan Riau','Jambi','Sumatera Selatan','Kepulauan Bangka Belitung','Bengkulu','Lampung','DKI Jakarta','Banten','Jawa Barat','Jawa Tengah','DI Yogyakarta','Jawa Timur','Bali','Nusa Tenggara Barat','Nusa Tenggara Timur','Kalimantan Barat','Kalimantan Tengah','Kalimantan Selatan','Kalimantan Timur','Kalimantan Utara','Sulawesi Utara','Gorontalo','Sulawesi Tengah','Sulawesi Barat','Sulawesi Selatan','Sulawesi Tenggara','Maluku','Maluku Utara','Papua','Papua Barat','Papua Selatan','Papua Tengah','Papua Pegunungan','Papua Barat Daya']);
const personalFields = [
  {name:'posisi',label:'Posisi yang dilamar',required:true},
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
  {name:'alamat_tipe',label:'Jenis alamat',type:'select',options:choices(['Jalan','Dusun','Kampung','Perumahan','Komplek','Lingkungan','Gang','Lorong','Blok','Apartemen','Lainnya']),wide:false},
  {name:'alamat_jalan',label:'Nama jalan / dusun / perumahan',wide:true,required:true},
  {name:'alamat_rt',label:'RT',inputmode:'numeric',maxlength:3,required:true},
  {name:'alamat_rw',label:'RW',inputmode:'numeric',maxlength:3,required:true},
  {name:'alamat_desa',label:'Desa / kelurahan',required:true},
  {name:'alamat_kecamatan',label:'Kecamatan',required:true},
  {name:'alamat_kota_jenis',label:'Kabupaten / kota',type:'select',options:choices(['Kabupaten','Kota']),required:true},
  {name:'alamat_kota_nama',label:'Nama kabupaten / kota',required:true},
  {name:'alamat_provinsi',label:'Provinsi',type:'select',options:provinceChoices,required:true},
  {name:'alamat_kodepos',label:'Kode pos',inputmode:'numeric',maxlength:5}
];
const parentFields = [
  {name:'ayah_nama',label:'Nama ayah'}, {name:'ayah_umur',label:'Umur ayah',type:'number',min:18,max:120},
  {name:'ayah_pendidikan',label:'Pendidikan ayah',type:'select',options:educationChoices}, {name:'ayah_pekerjaan',label:'Pekerjaan ayah'},
  {name:'ibu_nama',label:'Nama ibu'}, {name:'ibu_umur',label:'Umur ibu',type:'number',min:18,max:120},
  {name:'ibu_pendidikan',label:'Pendidikan ibu',type:'select',options:educationChoices}, {name:'ibu_pekerjaan',label:'Pekerjaan ibu'}
];
const maritalField = {name:'status_kawin',label:'Status perkawinan',type:'select',options:choices(['Belum kawin','Kawin','Cerai hidup','Cerai mati']),required:true};
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
const workKeys = [['perusahaan','Nama perusahaan'],['periode','Periode kerja'],['durasi','Durasi (bulan)','number'],['jabatan','Jabatan'],['usaha','Jenis usaha'],['jumlah','Jumlah karyawan','number'],['atasan','Nama atasan langsung'],['gaji','Gaji terakhir (Rp)','currency'],['alasan','Alasan berhenti']];
const refKeys = [['nama','Nama'],['alamat','Alamat'],['telepon','Telepon'],['pekerjaan','Pekerjaan'],['hubungan','Hubungan']];
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
  if(['gender','pasangan_lp','saudara1_lp','saudara2_lp','saudara3_lp','anak1_lp','anak2_lp','anak3_lp'].includes(field.name)){
    value=value==='L'?'Laki-laki':value==='P'?'Perempuan':value;
  }
  const required=field.required?'required':'';
  const wide=field.wide?'wide':'';
  const id=`f-${field.name}`;
  const label=`<label for="${esc(id)}">${esc(field.label)}</label>`;
  let control='';
  if(field.type==='select' || field.type==='year'){
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
  return sectionHtml('⌖','ALAMAT SESUAI KTP',`${basicGrid(addressFields,values)}<input type="hidden" name="alamat_asal" value="${esc(values.alamat_asal||'')}"><div class="address-preview" id="address-preview"></div><label class="inline-toggle"><input type="checkbox" name="domisili_berbeda" value="true" ${different?'checked':''}><span>Alamat domisili berbeda</span></label><div class="conditional-fields" data-conditional="true" data-block="domicile" ${different?'':'hidden'}>${basicGrid([{name:'domisili',label:'Alamat domisili',type:'textarea',wide:true}],values)}</div>`);
}
function renderFamily(values={}){
  const sibCount=Math.min(3,Math.max(1,Number(values.saudara_count||1)));
  const siblings=Array.from({length:sibCount},(_,i)=>{
    const n=i+1,p=`saudara${n}_`;
    const fs=n===1
      ? [{name:'saudara1_nama',label:'Nama',readonly:true},{name:'saudara1_lp',label:'Jenis kelamin',readonly:true},{name:'saudara1_umur',label:'Umur',readonly:true},{name:'saudara1_pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:'saudara1_pekerjaan',label:'Pekerjaan'}]
      : [{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:120},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
    const rowValues={...values,saudara1_nama:values.nama||values.saudara1_nama||'',saudara1_lp:values.gender||values.saudara1_lp||'',saudara1_umur:ageFrom(values.tanggal_lahir)||values.saudara1_umur||''};
    return `<div class="repeat-row"><div class="repeat-title">${n===1?'Anda':`Saudara ${n-1}`}</div>${basicGrid(fs,rowValues)}</div>`;
  }).join('');
  const childrenCount=Math.min(3,Math.max(0,Number(values.anak_count||0)));
  const children=Array.from({length:childrenCount},(_,i)=>{
    const n=i+1,p=`anak${n}_`;
    const fs=[{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:100},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
    return `<div class="repeat-row"><div class="repeat-title">Anak ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  const spouseHidden=values.status_kawin==='Kawin'?'':'hidden';
  const childrenHidden=!values.status_kawin||values.status_kawin==='Belum kawin'?'hidden':'';
  return sectionHtml('B','SUSUNAN KELUARGA',
    `<div class="repeat-title">Orang tua</div>${basicGrid(parentFields,values)}<div class="repeat-row"><div class="repeat-title">Saudara kandung · termasuk Anda</div>${countSelect('saudara_count','Jumlah saudara kandung',3,sibCount,1)}<div id="siblings-rows">${siblings}</div></div><div class="repeat-row"><div class="repeat-title">Status perkawinan</div>${basicGrid([maritalField],values)}</div><div class="conditional-fields" data-conditional="true" data-block="spouse" ${spouseHidden}><div class="repeat-title">Suami / istri</div>${basicGrid(spouseFields,values)}</div><div class="conditional-fields" data-conditional="true" data-block="children" ${childrenHidden}><div class="repeat-title">Anak</div>${countSelect('anak_count','Jumlah anak',3,childrenCount,0)}<div id="children-rows">${children}</div></div>`);
}
function renderEducation(values={}){
  return sectionHtml('C','PENDIDIKAN FORMAL',educationRows.map(row=>{
    const fields=row.fields.map(([key,label,type])=>({name:`${row.prefix}_${key}`,label,type:type==='year'?'year':undefined}));
    return `<div class="repeat-row"><div class="repeat-title">${row.title}</div>${basicGrid(fields,values)}</div>`;
  }).join(''));
}
function renderLanguages(values={}){
  const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0)));
  const rows=Array.from({length:count},(_,i)=>{
    const n=i+1,p=`bahasa${n}`;
    const fs=[{name:p,label:'Bahasa',type:'select',options:choices(['Indonesia','Inggris','Jawa','Madura','Sunda','Mandarin','Jepang','Korea','Arab','Lainnya'])},{name:p+'_bicara',label:'Berbicara',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_baca',label:'Membaca',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_tulis',label:'Menulis',type:'select',options:choices(['Dasar','Menengah','Mahir'])}];
    return `<div class="repeat-row"><div class="repeat-title">Bahasa ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  return sectionHtml('D','KEMAMPUAN BERBAHASA',`${countSelect('bahasa_count','Jumlah bahasa',4,count,0)}<div id="language-rows">${rows}</div>`);
}
function renderWork(values={}){
  const count=Math.min(3,Math.max(0,Number(values.kerja_count||0)));
  const rows=Array.from({length:count},(_,i)=>{
    const n=i+1,p=`kerja${n}_`,fs=workKeys.map(([key,label,type])=>({name:p+key,label,currency:type==='currency',type:type==='number'?'number':undefined,min:type==='number'?0:undefined,wide:['perusahaan','alasan'].includes(key)}));
    return `<div class="repeat-row"><div class="repeat-title">Pengalaman ${n}${n===1?' · terakhir':''}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  return sectionHtml('F','PENGALAMAN KERJA',`${countSelect('kerja_count','Jumlah pengalaman kerja',3,count,0)}<div class="conditional-fields" data-conditional="true" data-block="work-rows" ${count?'':'hidden'}><div id="work-rows">${rows}</div></div>`);
}
function renderReferences(values={}){
  const count=Math.min(2,Math.max(0,Number(values.referensi_count||0)));
  const rows=Array.from({length:count},(_,i)=>{
    const n=i+1,p=`referensi${n}_`,fs=refKeys.map(([key,label])=>({name:p+key,label,type:key==='alamat'?'textarea':key==='telepon'?'tel':key==='hubungan'?'select':undefined,options:key==='hubungan'?choices(['Atasan','Rekan kerja','Guru / Dosen','Keluarga','Lainnya']):undefined,wide:key==='alamat'}));
    return `<div class="repeat-row"><div class="repeat-title">Referensi ${n}</div>${basicGrid(fs,values)}</div>`;
  }).join('');
  return sectionHtml('H','REFERENSI',`${countSelect('referensi_count','Jumlah referensi',2,count,0)}<div class="conditional-fields" data-conditional="true" data-block="reference-rows" ${count?'':'hidden'}><div id="reference-rows">${rows}</div></div>`);
}
function renderForm(values={}){
  initialData=values;
  activeStep=Math.min(stepNames.length-1,Math.max(0,Number(values.__form_step||0)));
  const step0=`<div class="form-step" data-form-step="0">${sectionHtml('A','DATA PRIBADI',basicGrid(personalFields,values))}${renderAddress(values)}</div>`;
  const step1=`<div class="form-step" data-form-step="1">${renderFamily(values)}${renderEducation(values)}</div>`;
  const step2=`<div class="form-step" data-form-step="2">${renderLanguages(values)}${sectionHtml('E','HOBI',basicGrid([{name:'hobby',label:'Hobi dan minat',type:'textarea',wide:true}],values))}${renderWork(values)}</div>`;
  const step3=`<div class="form-step" data-form-step="3">${sectionHtml('G','EKSPEKTASI',basicGrid([{name:'mulai_kerja',label:'Tanggal mulai bisa bekerja',type:'date'},{name:'gaji_harapan',label:'Gaji yang diharapkan (Rp)',currency:true},{name:'fasilitas_harapan',label:'Fasilitas lain yang diharapkan',wide:true}],values))}${renderReferences(values)}${sectionHtml('I','PERTANYAAN TERBUKA',basicGrid([{name:'jawaban1',label:'Apa yang Anda ketahui tentang perusahaan kami?',type:'textarea',wide:true},{name:'jawaban2',label:'Ceritakan tentang pribadi Anda.',type:'textarea',wide:true},{name:'jawaban3',label:'Apa yang akan Anda lakukan untuk perusahaan kami jika diterima?',type:'textarea',wide:true}],values))}</div>`;
  const step4=`<div class="form-step" data-form-step="4">${sectionHtml('J','PERNYATAAN',`<label class="consent-wrap"><input type="checkbox" id="setuju" name="setuju" value="true" ${values.setuju?'checked':''} required><span>Dengan ini saya menyatakan semua data yang saya isi benar.</span></label>`)}<section class="form-section"><h2><span class="section-bullet">CV</span>CURRICULUM VITAE</h2><label class="upload-zone cv-upload-zone"><span class="upload-icon">↥</span><b id="cv-filename">${esc(cvFilename||'Unggah CV (PDF)')}</b><small>PDF · Maks. 10 MB</small><input type="file" id="cv-file" accept="application/pdf,.pdf"></label><div class="cv-upload-state" id="cv-upload-state"></div></section></div>`;
  return `<div class="step-top"><span class="stage-kicker">FORMULIR LAMARAN KERJA</span><span class="step-number" id="wizard-count"></span></div><div class="wizard-progress"><span id="wizard-progress-bar"></span></div><section class="candidate-card form-wizard-card"><div class="wizard-heading"><div><h1 class="candidate-title">Data pelamar</h1><div class="wizard-step-label" id="wizard-step-label"></div></div><span class="wizard-save-state" id="draft-save-state" aria-live="polite">●</span></div><form id="application-form" novalidate>${step0}${step1}${step2}${step3}${step4}<div id="form-error" class="form-error" role="alert"></div><div class="wizard-actions"><button type="button" class="btn btn-secondary" id="wizard-prev">Kembali</button><button type="button" class="btn btn-primary" id="wizard-next">Lanjut</button></div></form></section>`;
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
  for(let i=2;i<=3;i++){const key=`saudara${i}_lp`;if(genderMap[data[key]])data[key]=genderMap[data[key]];}
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
function updateDynamic(form,values){
  const marital=form.querySelector('[name="status_kawin"]')?.value||values.status_kawin||'';
  const spouse=form.querySelector('[data-block="spouse"]');if(spouse)spouse.hidden=marital!=='Kawin';
  const children=form.querySelector('[data-block="children"]');if(children)children.hidden=!marital||marital==='Belum kawin';
  const workCount=Number(form.querySelector('#kerja_count')?.value??values.kerja_count??0);
  const work=form.querySelector('[data-block="work-rows"]');if(work)work.hidden=workCount===0;
  const refCount=Number(form.querySelector('#referensi_count')?.value??values.referensi_count??0);
  const refs=form.querySelector('[data-block="reference-rows"]');if(refs)refs.hidden=refCount===0;
  const domicile=form.querySelector('[data-block="domicile"]');
  const domicileToggle=form.querySelector('[name="domisili_berbeda"]');
  if(domicile)domicile.hidden=!domicileToggle?.checked;
}
function rerenderGroups(form){
  const values=collect(form);
  const siblingCount=Math.min(3,Math.max(1,Number(values.saudara_count||1)));
  const siblingHost=$('#siblings-rows',form);
  if(siblingHost){
    siblingHost.innerHTML=Array.from({length:siblingCount},(_,i)=>{
      const n=i+1,p=`saudara${n}_`;
      const fields=n===1
        ? [{name:'saudara1_nama',label:'Nama',readonly:true},{name:'saudara1_lp',label:'Jenis kelamin',readonly:true},{name:'saudara1_umur',label:'Umur',readonly:true},{name:'saudara1_pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:'saudara1_pekerjaan',label:'Pekerjaan'}]
        : [{name:p+'nama',label:'Nama'},{name:p+'lp',label:'Jenis kelamin',type:'select',options:choices(['Laki-laki','Perempuan'])},{name:p+'umur',label:'Umur',type:'number',min:0,max:120},{name:p+'pendidikan',label:'Pendidikan',type:'select',options:educationChoices},{name:p+'pekerjaan',label:'Pekerjaan'}];
      const rowValues={...values,saudara1_nama:values.nama||'',saudara1_lp:values.gender==='L'?'Laki-laki':values.gender==='P'?'Perempuan':'',saudara1_umur:values.umur||''};
      return `<div class="repeat-row"><div class="repeat-title">${n===1?'Anda':`Saudara ${n-1}`}</div>${basicGrid(fields,rowValues)}</div>`;
    }).join('');
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
    const count=Math.min(4,Math.max(0,Number(values.bahasa_count||0)));
    languageHost.innerHTML=Array.from({length:count},(_,i)=>{
      const p=`bahasa${i+1}`,fields=[{name:p,label:'Bahasa',type:'select',options:choices(['Indonesia','Inggris','Jawa','Madura','Sunda','Mandarin','Jepang','Korea','Arab','Lainnya'])},{name:p+'_bicara',label:'Berbicara',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_baca',label:'Membaca',type:'select',options:choices(['Dasar','Menengah','Mahir'])},{name:p+'_tulis',label:'Menulis',type:'select',options:choices(['Dasar','Menengah','Mahir'])}];
      return `<div class="repeat-row"><div class="repeat-title">Bahasa ${i+1}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
  }
  const workHost=$('#work-rows',form);
  if(workHost){
    const count=Math.min(3,Math.max(0,Number(values.kerja_count||0)));
    workHost.innerHTML=Array.from({length:count},(_,i)=>{
      const n=i+1,p=`kerja${n}_`,fields=workKeys.map(([key,label,type])=>({name:p+key,label,currency:type==='currency',type:type==='number'?'number':undefined,min:type==='number'?0:undefined,wide:['perusahaan','alasan'].includes(key)}));
      return `<div class="repeat-row"><div class="repeat-title">Pengalaman ${n}${n===1?' · terakhir':''}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
  }
  const refsHost=$('#reference-rows',form);
  if(refsHost){
    const count=Math.min(2,Math.max(0,Number(values.referensi_count||0)));
    refsHost.innerHTML=Array.from({length:count},(_,i)=>{
      const p=`referensi${i+1}_`,fields=refKeys.map(([key,label])=>({name:p+key,label,type:key==='alamat'?'textarea':key==='telepon'?'tel':key==='hubungan'?'select':undefined,options:key==='hubungan'?choices(['Atasan','Rekan kerja','Guru / Dosen','Keluarga','Lainnya']):undefined,wide:key==='alamat'}));
      return `<div class="repeat-row"><div class="repeat-title">Referensi ${i+1}</div>${basicGrid(fields,values)}</div>`;
    }).join('');
  }
  updateDynamic(form,values);
  syncApplicantRow(form);
  updateAddressPreview(form);
}
function updateAddressPreview(form){
  const preview=$('#address-preview',form);if(!preview)return;
  const data={};for(const key of addressFields.map(f=>f.name)){const el=form.elements.namedItem(key);data[key]=el?.value||'';}
  const address=formatKtpAddress(data);
  const hidden=form.elements.namedItem('alamat_asal');if(hidden)hidden.value=address;
  preview.textContent=address;
  preview.classList.toggle('empty',!address);
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
  // Conditional data is retained in the local draft but excluded from the final
  // application record when the corresponding branch does not apply.
  if(result.status_kawin!=='Kawin') for(const key of Object.keys(result)) if(key.startsWith('pasangan_')) delete result[key];
  if(!result.status_kawin||result.status_kawin==='Belum kawin') for(const key of Object.keys(result)) if(key.startsWith('anak')) delete result[key];
  if(String(result.domisili_berbeda)!=='true') result.domisili=result.alamat_asal||'';
  delete result.domisili_berbeda;
  delete result.__saved_at; delete result.__cv_filename;
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
  const sx=Math.max(0,(frame.left-box.left-offsetX)/scale);
  const sy=Math.max(0,(frame.top-box.top-offsetY)/scale);
  const sw=Math.min(video.videoWidth-sx,frame.width/scale);
  const sh=Math.min(video.videoHeight-sy,frame.height/scale);
  if(sw<80||sh<50)throw new Error('Posisi KTP belum masuk bingkai.');
  const canvas=document.createElement('canvas');
  const factor=Math.min(2,1800/sw);
  canvas.width=Math.round(sw*factor);canvas.height=Math.round(sh*factor);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  enhanceForOcr(canvas);
  return canvas;
}
function enhanceForOcr(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const image=ctx.getImageData(0,0,canvas.width,canvas.height),d=image.data;
  for(let i=0;i<d.length;i+=4){
    const gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
    const contrast=Math.max(0,Math.min(255,(gray-118)*1.38+128));
    d[i]=d[i+1]=d[i+2]=contrast;
  }
  ctx.putImageData(image,0,0);
}
async function runOcr(canvas){
  if(!window.Tesseract)throw new Error('Kamera siap, tetapi OCR tidak tersedia.');
  const status=$('#ocr-status');
  if(status)status.textContent='Membaca…';
  let result;
  try{
    result=await window.Tesseract.recognize(canvas,'ind+eng',{logger:m=>{
      if(m.status==='recognizing text'&&status)status.textContent=`Membaca ${Math.round((m.progress||0)*100)}%`;
    }});
  }catch(first){result=await window.Tesseract.recognize(canvas,'eng');}
  const parsed=extractKtpText(result.data?.text||'');
  const useful=['nik','nama','tempat_lahir','tanggal_lahir','gender','alamat_jalan','alamat_rt','alamat_desa','alamat_kecamatan'].some(k=>parsed[k]);
  if(!useful)throw new Error('Tulisan KTP belum terbaca. Atur posisi dan cahaya, lalu ambil ulang.');
  initialData={...initialData,...parsed};
  writeLocalInitialDraft(initialData);
  stopCamera();
  showForm();
}
async function startCamera(){
  const video=$('#ktp-video'),status=$('#camera-status'),fallback=$('#ktp-fallback');
  if(!navigator.mediaDevices?.getUserMedia){cameraFallback=true;fallback.hidden=false;if(status)status.textContent='Kamera langsung tidak tersedia di browser ini.';return;}
  try{
    mediaStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},focusMode:{ideal:'continuous'}}});
    video.srcObject=mediaStream;await video.play();
    $('#capture-ktp').disabled=false;
    if(status)status.textContent='';
  }catch(error){
    cameraFallback=true;fallback.hidden=false;$('#capture-ktp').disabled=true;
    if(status)status.textContent='Izinkan kamera atau gunakan kamera ponsel.';
  }
}
async function processPhotoFile(file){
  if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){saveState('Format foto tidak didukung.',true);return;}
  if(file.size>8*1024*1024){saveState('Ukuran foto maksimal 8 MB.',true);return;}
  const status=$('#ocr-status');if(status)status.textContent='Membaca…';
  try{
    const bitmap=await createImageBitmap(file);
    // The native camera fallback opens the phone's rear camera first. Crop to the
    // exact horizontal KTP ratio instead of treating the upload as a document.
    const ratio=1.586,sw=Math.min(bitmap.width,bitmap.height*ratio),sh=sw/ratio;
    const sx=(bitmap.width-sw)/2,sy=(bitmap.height-sh)/2;
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=Math.round(1800/ratio);
    canvas.getContext('2d').drawImage(bitmap,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    bitmap.close?.();enhanceForOcr(canvas);await runOcr(canvas);
  }catch(error){
    if(status)status.textContent=error.message||'KTP belum terbaca.';
    // Stay on the camera screen so the candidate can retake the photo.
    if(mediaStream)stopCamera();
    if(cameraFallback){const input=$('#ktp-fallback-input');if(input)input.value='';}
  }
}
function showKtpScreen(){
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">PORTAL KARIR</span><span class="step-number">IDENTITAS</span></div><div class="wizard-progress"><span style="width:8%"></span></div><section class="candidate-card ktp-card"><h1 class="candidate-title">Pindai KTP</h1><div class="ktp-camera-frame" id="ktp-camera-frame"><video id="ktp-video" autoplay muted playsinline></video><div class="ktp-guide" id="ktp-guide"><span>POSISIKAN KTP</span></div><div class="ktp-camera-corners" aria-hidden="true"></div></div><div class="ocr-status" id="ocr-status" aria-live="polite"></div><div class="camera-status" id="camera-status"></div><div id="ktp-fallback" class="ktp-fallback" hidden><button type="button" class="btn btn-secondary full" id="open-phone-camera">Buka kamera ponsel</button></div><input type="file" id="ktp-fallback-input" accept="image/*" capture="environment" hidden><div class="candidate-actions camera-actions"><button type="button" class="btn btn-primary" id="capture-ktp" disabled>Ambil foto KTP</button></div><button type="button" class="manual-entry" id="manual-entry">Isi tanpa foto KTP</button></section>`;
  startCamera();
  $('#capture-ktp').addEventListener('click',async()=>{
    const button=$('#capture-ktp');setBusy(button,true,'Membaca KTP…');
    try{const canvas=cameraCropCanvas();await runOcr(canvas);}catch(error){const status=$('#ocr-status');if(status)status.textContent=error.message||'Foto gagal diproses.';}
    finally{if($('#capture-ktp'))setBusy($('#capture-ktp'),false);}
  });
  $('#open-phone-camera').addEventListener('click',()=>$('#ktp-fallback-input').click());
  $('#ktp-fallback-input').addEventListener('change',event=>processPhotoFile(event.target.files?.[0]));
  $('#manual-entry').addEventListener('click',()=>{stopCamera();writeLocalInitialDraft({});showForm();});
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
    status.textContent='CV tersimpan';
    await flushDraft(form);
  }catch(error){
    status.textContent=error.message||'CV belum tersimpan.';saveState('Belum tersimpan',true);
  }
}
function showForm(){
  stopCamera();
  root.innerHTML=renderForm(initialData);
  const form=$('#application-form');
  $('#cv-filename').textContent=cvFilename||'Unggah CV (PDF)';
  $('#cv-upload-state').textContent=cvFilename?'CV tersimpan':'';
  const nik=form.querySelector('[name="nik"]');
  const numericFields=['nik','alamat_rt','alamat_rw','alamat_kodepos'];
  form.addEventListener('input',event=>{
    const el=event.target;
    if(numericFields.includes(el.name))normalizeDigitInput(el,el.name==='nik'?16:el.name==='alamat_kodepos'?5:3);
    if(el.name==='telepon')normalizeDigitInput(el,16);
    if(el.dataset.formatNumber==='idr')formatCurrencyInput(el);
    if(['nama','tanggal_lahir','gender'].includes(el.name))syncApplicantRow(form);
    if(addressFields.some(f=>f.name===el.name))updateAddressPreview(form);
    queueDraftSave(form);
  });
  form.addEventListener('change',event=>{
    const key=event.target.name;
    if(['alamat_rt','alamat_rw'].includes(key))padRtRw(event.target);
    if(['saudara_count','anak_count','bahasa_count','kerja_count','referensi_count'].includes(key))rerenderGroups(form);
    else if(key==='status_kawin' || key==='domisili_berbeda'){
      const current=collect(form);updateDynamic(form,current);
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
    if(!validateWholeForm(form))return;
    await submitApplication(form);
  });
  rerenderGroups(form);
  setWizardStep(activeStep);
  queueDraftSave(form);
  if(cvFilename)$('#cv-upload-state').textContent='CV tersimpan';
  history.replaceState({portalForm:true,step:activeStep,root:true},'',location.href);
  history.pushState({portalForm:true,step:activeStep,root:false},'',location.href);
  writeLocalDraft(form);
}

function showExisting(ctx){
  const nextUrl=stageUrl(3);
  if(ctx.disc_completed||ctx.stage==='disc_completed'){
    root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Tes DISC selesai</h1><p>${esc(ctx.full_name||'')}</p></section>`;return;
  }
  root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Lamaran tersimpan</h1><p>${esc(ctx.full_name||'')}</p><a class="btn btn-primary full" href="${esc(nextUrl)}">Lanjutkan DISC</a></section>`;
}
async function submitApplication(form){
  const error=$('#form-error'),button=$('#wizard-next');
  error.textContent='';
  if(!isConfigured){error.textContent='Server belum terhubung.';return;}
  const data=sanitizeFinalData(collect(form));
  if(!/^\d{16}$/.test(String(data.nik||''))){setWizardStep(0);error.textContent='NIK harus terdiri dari 16 angka.';return;}
  if(!data.nama){setWizardStep(0);error.textContent='Nama lengkap wajib diisi.';return;}
  if(!draftToken)draftToken=newCandidateToken();
  setBusy(button,true,'Mengirim…');
  try{
    await flushDraft(form);
    const path=`${CV_PATH_PREFIX}/${draftToken}/cv.pdf`;
    const {data:result,error:submitError}=await supabase.rpc('submit_candidate_application',{p_access_token:draftToken,p_data:data,p_cv_path:path});
    if(submitError)throw submitError;
    storeCandidateToken(draftToken);
    try{localStorage.removeItem(localDraftKey());}catch{}
    root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Lamaran terkirim</h1><p>${esc(data.nama)}</p><a class="btn btn-primary full" href="${esc(stageUrl(3))}">Lanjutkan ke DISC</a></section>`;
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
