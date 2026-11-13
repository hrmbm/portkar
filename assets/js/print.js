import { TEMPLATE_URL, CV_BUCKET } from './config.js';
import { supabase } from './supabase.js';
import { computeDisc } from './disc-engine.js';
import { esc } from './common.js';

const printDate = d => new Date(d || Date.now()).toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
const getDiscSubmission = record => Array.isArray(record?.disc_submissions) ? record.disc_submissions[0] : record?.disc_submissions;

async function renderPdfPages(url) {
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
  const pdf = await pdfjs.getDocument({ url }).promise;
  const pages = [];
  for (let n=1; n<=pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({scale:1.55});
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    pages.push(canvas.toDataURL('image/jpeg',0.92));
  }
  return pages;
}

function fillMaster(doc, data, record = {}) {
  const app = data || {};
  doc.querySelectorAll('#applicationForm [name]').forEach(el => {
    const name = el.getAttribute('name');
    let value = app[name] ?? '';
    const fillPath = el.getAttribute('data-application-fill');
    if (fillPath === 'applicant.full_name' || name === 'nama_terang') value = record.full_name || app.nama || value;
    if (el.type === 'radio') {
      const checked = String(value) === el.value;
      el.checked = checked;
      if (checked) el.setAttribute('checked', 'checked'); else el.removeAttribute('checked');
    } else if (el.type === 'checkbox') {
      const checked = Array.isArray(value)
        ? value.map(String).includes(String(el.value))
        : value === true || value === 'true' || value === '1' || value === 'on';
      el.checked = checked;
      if (checked) el.setAttribute('checked', 'checked'); else el.removeAttribute('checked');
    } else if (el.tagName === 'SELECT') {
      el.value = String(value);
      [...el.options].forEach(option => {
        if (option.value === String(value)) option.setAttribute('selected', 'selected');
        else option.removeAttribute('selected');
      });
    } else if (el.tagName === 'TEXTAREA') {
      el.value = String(value);
      el.textContent = String(value);
    } else {
      el.value = String(value);
      el.setAttribute('value', String(value));
    }
  });
}

function sanitizePrintDocument(doc) {
  doc.querySelectorAll('.toolbar,script,iframe,object,embed').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if (['href', 'src', 'action', 'formaction'].includes(attr.name.toLowerCase()) && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  doc.querySelectorAll('form').forEach(form => form.removeAttribute('action'));
}

async function getActiveMasterHtml() {
  if (supabase) {
    const { data, error } = await supabase.from('print_templates')
      .select('html_content').eq('is_active', true).maybeSingle();
    if (!error && data?.html_content) return data.html_content;
    // Before the Stage 3 migration, keep printing operational with the bundled master.
    if (error && !['42P01', 'PGRST205', 'PGRST204'].includes(error.code)) throw error;
  }
  const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('Master HTML lamaran tidak ditemukan.');
  return response.text();
}

function chartSvg(values, label) {
  const W=310,H=145,left=20,right=12,top=12,bottom=25,plotH=H-top-bottom;
  const x=i=>left+i*(W-left-right)/3;
  const y=v=>top+(8-v)/16*plotH;
  const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  const axes=['D','I','S','C'];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><line x1="${left}" y1="${y(0)}" x2="${W-right}" y2="${y(0)}" stroke="#cbd5e1" stroke-dasharray="3 3"/>${[-8,-4,0,4,8].map(v=>`<line x1="${left}" y1="${y(v)}" x2="${W-right}" y2="${y(v)}" stroke="#edf1f6"/><text x="${left-6}" y="${y(v)+3}" text-anchor="end" fill="#94a3b8" font-size="8">${v}</text>`).join('')}<polyline points="${points}" fill="none" stroke="#496dcc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#496dcc"/><text x="${x(i)}" y="${H-7}" text-anchor="middle" fill="#64748b" font-size="9" font-weight="700">${axes[i]}</text>`).join('')}</svg>`;
}

function discReportHtml(record, result) {
  const app=record.application_data||{};
  const submission=getDiscSubmission(record);
  const id={name:record.full_name||app.nama||'',age:app.umur||'',gender:app.gender==='L'?'Laki-laki':app.gender==='P'?'Perempuan':app.gender||'',date:submission?.completed_at||Date.now()};
  const panels=[
    {title:'GRAFIK 1 — MOST',desc:'Topeng / citra yang ditampilkan',values:result.g1,pattern:result.pola[0]},
    {title:'GRAFIK 2 — LEAST',desc:'Kepribadian di bawah tekanan',values:result.g2,pattern:result.pola[1]},
    {title:'GRAFIK 3 — CHANGE',desc:'Kepribadian alami (diri sejati)',values:result.g3,pattern:result.pola[2]}
  ];
  const detail=result.detail||{};
  return `<section class="aux-sheet disc-sheet"><div class="disc-hero"><div><div class="disc-eyebrow">SELF INVENTORY PERSONALITY TEST</div><h1>HASIL TES D.I.S.C.</h1><div class="disc-meta"><div><b>Nama</b>: ${esc(id.name)}</div><div><b>Usia</b>: ${esc(id.age)} tahun &nbsp; <b>Jenis Kelamin</b>: ${esc(id.gender)}</div><div><b>Tanggal Tes</b>: ${esc(printDate(id.date))}</div></div></div><div class="disc-badge">Profil Alami<br><b>${esc(result.pola[2].nama)} · ${esc(result.pola[2].title)}</b></div></div><h2>TIGA GRAFIK DISC</h2><div class="disc-graphs">${panels.map((p)=>`<div class="disc-chart"><b>${esc(p.title)}</b><small>${esc(p.desc)}</small>${chartSvg(p.values,p.title)}<div class="disc-pattern">Pola: <b>${esc(p.pattern.nama)}</b> — ${esc(p.pattern.title)}</div></div>`).join('')}</div><h2>INTERPRETASI POLA</h2><div class="disc-pattern-grid">${panels.map(p=>`<div class="disc-pattern-card"><b>${esc(p.title.replace(/^GRAFIK [123] — /,''))}</b><small>${esc(p.pattern.nama)} · ${esc(p.pattern.title)}</small><p>${esc(p.pattern.description)}</p><div class="disc-chips">${(p.pattern.traits||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div></div>`).join('')}</div><h2>PROFIL DOMINAN · ${esc(result.hurufDominan)}</h2><div class="disc-detail"><h3>${esc(detail.judul||'')}</h3><p>${esc(detail.deskripsi||'')}</p><div class="disc-detail-cols"><div><b>Kecenderungan</b><ul>${(detail.kecenderungan||[]).map(x=>`<li>${esc(x.replace(/^•\s*/,''))}</li>`).join('')}</ul></div><div><b>Pengembangan</b><ul>${(detail.pengembangan||[]).map(x=>`<li>${esc(x.replace(/^•\s*/,''))}</li>`).join('')}</ul></div></div></div><div class="disc-footer">Hasil pengolahan otomatis · Portal Karir</div></section>`;
}

export async function printApplication(record) {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.');
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Izinkan pop-up untuk mencetak dokumen.');
  tab.document.write('<!doctype html><title>Menyiapkan dokumen…</title><p style="font:14px Arial;padding:30px">Menyiapkan Lamaran, CV, dan DISC…</p>');
  try {
    const masterText = await getActiveMasterHtml();
    const parser = new DOMParser();
    const doc = parser.parseFromString(masterText, 'text/html');
    if (!doc.querySelector('#applicationForm')) throw new Error('Master aktif tidak memiliki #applicationForm.');
    sanitizePrintDocument(doc);
    fillMaster(doc, record.application_data || {}, record);
    doc.body.classList.add('combined-print');

    let cvPages = [];
    if (record.cv_path) {
      const { data: signed, error } = await supabase.storage.from(CV_BUCKET).createSignedUrl(record.cv_path, 180);
      if (error) throw error;
      cvPages = await renderPdfPages(signed.signedUrl);
    }
    const cvSection = cvPages.length
      ? cvPages.map((src, index) => `<section class="aux-sheet cv-page-sheet"><img src="${src}" alt="CV halaman ${index + 1}"><span>CV · ${index + 1} / ${cvPages.length}</span></section>`).join('')
      : '<section class="aux-sheet cv-page-sheet cv-missing"><div><h1>CURRICULUM VITAE</h1><p>CV belum tersedia.</p></div></section>';

    let discSection = '<section class="aux-sheet disc-sheet"><h1>HASIL TES D.I.S.C.</h1><p>Belum ada hasil tes DISC untuk kandidat ini.</p></section>';
    const answerRows = getDiscSubmission(record)?.answers;
    if (Array.isArray(answerRows) && answerRows.length === 24) {
      const result = computeDisc(answerRows);
      discSection = discReportHtml(record, result);
    }
    const extras = document.createElement('div');
    extras.innerHTML = cvSection + discSection;
    doc.body.append(...extras.children);

    const style = doc.createElement('style');
    style.textContent = `
      @page{size:A4 portrait;margin:0}
      @media print{
        html,body{margin:0!important;padding:0!important;background:#fff!important}
        .toolbar{display:none!important}
        .sheet{page-break-after:always;break-after:page}
        .aux-sheet{page-break-before:always;break-before:page}
        .cv-page-sheet{page-break-after:always;break-after:page}
        .cv-page-sheet:last-of-type{page-break-after:always;break-after:page}
      }
      .cv-page-sheet{width:210mm;height:297mm;min-height:297mm;position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:5mm;background:#fff;color:#111;overflow:hidden}
      .cv-page-sheet img{display:block;max-width:200mm;max-height:287mm;width:auto;height:auto;object-fit:contain}
      .cv-page-sheet>span{position:absolute;right:8mm;bottom:5mm;color:#9aa3af;font:7px Arial,sans-serif}
      .cv-missing{font-family:Arial,sans-serif;text-align:center}
      .cv-missing h1{font-size:18px}.cv-missing p{font-size:11px;color:#64748b}
      .disc-sheet{width:210mm;min-height:297mm;box-sizing:border-box;padding:11mm 12mm;background:#fff;color:#152033;font:9px Arial,sans-serif;page-break-before:always;break-before:page}
      .disc-hero{display:flex;justify-content:space-between;gap:10mm;padding:8mm;background:linear-gradient(135deg,#17243a,#355482);color:#fff;border-radius:7px;margin-bottom:5mm}
      .disc-eyebrow{font-size:7px;letter-spacing:2px;color:#bfd0ed}.disc-hero h1{font-size:18px;letter-spacing:1px;margin:3mm 0}
      .disc-meta{font-size:9px;line-height:1.6}.disc-meta b{display:inline-block;min-width:75px;color:#d6e1f3}
      .disc-badge{align-self:center;padding:4mm;border:1px solid #91a7cd;border-radius:6px;font-size:8px;line-height:1.6;min-width:42mm}.disc-badge b{font-size:10px}
      .disc-sheet h2{font-size:10px;letter-spacing:1px;color:#294a79;border-bottom:1px solid #d9e2f0;padding-bottom:2mm;margin:5mm 0 3mm}
      .disc-graphs{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.disc-chart{border:1px solid #e2e8f0;background:#f8fafc;border-radius:6px;padding:3mm;text-align:center;break-inside:avoid}
      .disc-chart>b{font-size:9px;display:block}.disc-chart small{font-size:7px;color:#748399;display:block;margin:1mm 0}.disc-chart svg{width:100%;height:auto}
      .disc-pattern{font-size:7px;padding-top:2mm;color:#43536b}.disc-pattern-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
      .disc-pattern-card{border:1px solid #e2e8f0;border-radius:5px;padding:3mm;background:#f8fafc;break-inside:avoid}
      .disc-pattern-card>b{display:block;font-size:9px}.disc-pattern-card small{font-size:7px;color:#5c6b82}
      .disc-pattern-card p{font-size:7.5px;line-height:1.45;text-align:justify}.disc-chips span{display:inline-block;background:#e9effa;color:#345181;border-radius:10px;padding:1.2mm 2mm;margin:1mm;font-size:6.8px}
      .disc-detail{border:1px solid #dce5f0;padding:4mm;border-radius:5px;break-inside:avoid}.disc-detail h3{font-size:10px;margin:0 0 2mm}
      .disc-detail p{line-height:1.5;text-align:justify;margin:0 0 3mm}.disc-detail-cols{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
      .disc-detail-cols b{font-size:8px}.disc-detail-cols ul{font-size:7.2px;line-height:1.4;padding-left:4mm;margin:2mm 0}
      .disc-footer{margin-top:4mm;border-top:1px solid #e2e8f0;padding-top:2mm;text-align:center;color:#94a3b8;font-size:7px}
    `;
    doc.head.append(style);
    tab.document.open();
    tab.document.write('<!doctype html>' + doc.documentElement.outerHTML);
    tab.document.close();
    const images = [...tab.document.images];
    await Promise.all(images.map(image => image.decode?.().catch(() => null)));
    if (tab.document.fonts?.ready) await tab.document.fonts.ready;
    tab.focus();
    setTimeout(() => { try { tab.print(); } catch { /* browser print UI */ } }, 350);
  } catch (error) {
    tab.close();
    throw error;
  }
}
