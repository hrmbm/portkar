import { supabase, isConfigured } from './supabase.js';
import { QUESTIONS, ageFromDate } from './disc-engine.js';
import { $, esc, candidateToken, storeCandidateToken, setBusy } from './common.js';

const root=$('#disc-app');
let token='';
let applicant=null;
let answers=[];
let current=0;
const storageKey=()=>`portal_disc_${token}`;

function saveLocal(){try{localStorage.setItem(storageKey(),JSON.stringify(answers));}catch(e){}}
function loadLocal(){try{const parsed=JSON.parse(localStorage.getItem(storageKey())||'[]');if(Array.isArray(parsed)&&parsed.length===24)return parsed;}catch(e){}return Array.from({length:24},()=>({most:null,least:null}));}
function selectionButton(qi,oi,kind,value){
  const selected=answers[qi]?.[kind]===oi;
  const other=answers[qi]?.[kind==='most'?'least':'most'];
  const conflict=other===oi&&!selected;
  const cls=selected?(kind==='most'?'selected-most':'selected-least'):'';
  return `<button type="button" class="disc-pick ${cls}" data-kind="${kind}" data-option="${oi}" ${conflict?'disabled':''}>${kind==='most'?'PALING':'TIDAK'}</button>`;
}
function renderQuestion(){
  const q=QUESTIONS[current];
  const done=answers.filter(a=>Number.isInteger(a.most)&&Number.isInteger(a.least)).length;
  root.innerHTML=`<div class="step-top"><span class="stage-kicker">REKRUTMEN · TAHAP 3</span><span class="step-number">${esc(applicant?.full_name||'')}</span></div><div class="disc-progress-meta"><span>PERTANYAAN ${String(current+1).padStart(2,'0')} / 24</span><span>${Math.round(done/24*100)}%</span></div><div class="step-progress"><span style="width:${(current+1)/24*100}%"></span></div><section class="disc-card"><h1 class="disc-q-title">Pilih dua pernyataan</h1><div class="disc-q-sub">${esc(applicant?.full_name||'')}</div><div class="disc-legend"><span>PALING menggambarkan saya</span><span>PALING TIDAK menggambarkan saya</span></div>${q.map((choice,i)=>`<div class="disc-option"><div class="disc-option-text">${esc(choice)}</div>${selectionButton(current,i,'most')}${selectionButton(current,i,'least')}</div>`).join('')}<div id="disc-error" class="candidate-toast" hidden></div><div class="candidate-actions"><button class="btn btn-secondary" id="disc-back" type="button" ${current===0?'disabled':''}>Kembali</button><button class="btn btn-primary" id="disc-next" type="button">${current===23?'Kirim jawaban':'Lanjut'}</button></div></section>`;
  root.querySelectorAll('.disc-pick').forEach(button=>button.addEventListener('click',()=>{
    const kind=button.dataset.kind,option=Number(button.dataset.option),other=kind==='most'?'least':'most';
    if(answers[current][other]===option)return;
    answers[current][kind]=option;saveLocal();renderQuestion();
  }));
  $('#disc-back').addEventListener('click',()=>{if(current>0){current--;renderQuestion();}});
  $('#disc-next').addEventListener('click',submitOrNext);
}
async function submitOrNext(){
  const item=answers[current];
  if(!Number.isInteger(item?.most)||!Number.isInteger(item?.least)||item.most===item.least){
    const error=$('#disc-error');error.hidden=false;error.textContent='Pilih satu PALING dan satu PALING TIDAK.';return;
  }
  if(current<23){current++;renderQuestion();return;}
  const button=$('#disc-next');setBusy(button,true,'Menyimpan…');
  try{
    const {data,error}=await supabase.rpc('submit_disc_answers',{p_access_token:token,p_answers:answers});
    if(error)throw error;
    localStorage.removeItem(storageKey());
    root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Tes DISC selesai</h1><p>${esc(applicant?.full_name||'')}</p></section>`;
  }catch(error){
    const e=$('#disc-error');if(e){e.hidden=false;e.textContent=error.message||'Jawaban belum berhasil disimpan.';}
    setBusy(button,false);
  }
}
async function init(){
  token=candidateToken();
  if(!isConfigured){root.innerHTML='<section class="candidate-card"><h1 class="candidate-title">Tes DISC</h1><p class="candidate-sub">Supabase belum dikonfigurasi.</p></section>';return;}
  if(!token){root.innerHTML='<section class="candidate-card"><h1 class="candidate-title">Tautan tidak valid</h1></section>';return;}
  const {data,error}=await supabase.rpc('get_candidate_context',{p_access_token:token});
  if(error||!data){root.innerHTML='<section class="candidate-card"><h1 class="candidate-title">Tautan tidak valid</h1></section>';return;}
  applicant=data;storeCandidateToken(token);
  if(data.disc_completed||data.stage==='disc_completed'){
    root.innerHTML=`<section class="candidate-card completion-card"><div class="completion-mark">✓</div><h1>Tes DISC sudah selesai</h1><p>${esc(data.full_name||'')}</p></section>`;return;
  }
  answers=loadLocal();
  renderQuestion();
}
init().catch(err=>{root.innerHTML=`<section class="candidate-card"><h1 class="candidate-title">Tes DISC</h1><p class="candidate-sub">${esc(err.message||'Tidak dapat memuat tes.')}</p></section>`;});
