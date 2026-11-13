export const $ = (selector, root=document) => root.querySelector(selector);
export const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
export const esc = (value='') => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const idDate = value => value ? new Date(value).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
export const ageFrom = value => {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`); if (Number.isNaN(d.getTime())) return '';
  const now = new Date(); let n = now.getFullYear()-d.getFullYear();
  if (now.getMonth()<d.getMonth() || (now.getMonth()===d.getMonth() && now.getDate()<d.getDate())) n--;
  return n >= 0 && n < 120 ? n : '';
};

const TOKEN_KEY = 'portal_candidate_token_v3';
const LEGACY_TOKEN_KEY = 'portal_candidate_token_v2';
const OLDER_TOKEN_KEY = 'portal_candidate_token';
const COOKIE_TOKEN = 'portal_candidate_session';
const siteRoot = new URL('../../', import.meta.url);
const candidateRoutes = {1:'apply/',2:'form/',3:'disc/',4:'spm/'};

export function candidateToken(){
  // URL is intentionally clean. Keep compatibility with older links once, then
  // permanently move the session to browser storage + a first-party cookie.
  const params = new URLSearchParams(location.search);
  const legacy = params.get('k');
  if (legacy) {
    storeCandidateToken(legacy);
    try { history.replaceState(history.state, '', location.pathname + location.hash); } catch {}
    return legacy;
  }
  try {
    const stored = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || localStorage.getItem(OLDER_TOKEN_KEY);
    if (stored) { storeCandidateToken(stored); return stored; }
  } catch {}
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_TOKEN + '=([^;]*)'));
    if (match?.[1]) { const token = decodeURIComponent(match[1]); storeCandidateToken(token); return token; }
  } catch {}
  return '';
}
export function storeCandidateToken(token){
  if (!token) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    localStorage.setItem(OLDER_TOKEN_KEY, token);
  } catch {}
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_TOKEN}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {}
}
export function clearCandidateToken(){
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(LEGACY_TOKEN_KEY); localStorage.removeItem(OLDER_TOKEN_KEY); } catch {}
  try { document.cookie = `${COOKIE_TOKEN}=; Path=/; Max-Age=0; SameSite=Lax`; } catch {}
}
export function newCandidateToken(){
  const token = crypto.randomUUID();
  storeCandidateToken(token);
  return token;
}
export const stageUrl = (stage) => new URL(candidateRoutes[stage] || 'form/', siteRoot).href;
export function setCandidateMessage(root, title, body='', tone='success') {
  root.innerHTML = `<section class="candidate-card completion-card"><div class="completion-mark">${tone==='success'?'✓':'!'}</div><h1>${esc(title)}</h1><p>${esc(body)}</p></section>`;
}
export function showError(element, message) { if (element) element.textContent = message || ''; }
export function setBusy(button, busy, label='Memproses…') {
  if (!button) return;
  if (busy) { button.dataset.oldText = button.textContent; button.textContent = label; button.disabled = true; }
  else { button.textContent = button.dataset.oldText || button.textContent; button.disabled = false; }
}
