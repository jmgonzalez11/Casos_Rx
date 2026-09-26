'use strict';
/* =====================================================================
   Casos · registro cifrado de casos de radiología
   - Datos en IndexedDB, cifrados con AES-GCM-256 (clave derivada de una
     frase con PBKDF2-SHA256, 600.000 iteraciones).
   - Sincronización con un Google Sheet propio vía Apps Script: el Sheet
     solo recibe texto cifrado.
   ===================================================================== */

/* ---------------- Catálogos ---------------- */
const ESPECIALIDADES = ['Negato', 'TC de cuerpo', 'MR de cuerpo', 'Ecografía gris', 'Ecografía Doppler',
  'Neurorradiología', 'Musculoesquelético', 'Pediatría', 'Imágenes mamarias', 'Digestivo', 'Intervencional'];
const ESP_COLOR = {
  'Negato': '#7C8B99', 'TC de cuerpo': '#2B79C2', 'MR de cuerpo': '#7456C8', 'Ecografía gris': '#3E9A8E',
  'Ecografía Doppler': '#D2453B', 'Neurorradiología': '#B5408C', 'Musculoesquelético': '#DD8420',
  'Pediatría': '#3E9F4B', 'Imágenes mamarias': '#E0719F', 'Digestivo': '#98773A', 'Intervencional': '#1F97BE'
};
const espColor = e => ESP_COLOR[e] || '#8795A2';
const MODALIDADES = ['Rx', 'Eco', 'Eco Doppler', 'TC', 'RM', 'Mamografía', 'Fluoroscopía', 'Angiografía', 'PET-TC', 'Medicina nuclear', 'Otra'];
const TIPOS = ['Entrega', 'Seguimiento', 'FU', 'Otro'];
const MESES = ['1', '2', '3', '4'];

const VERIF = 'casos-rad-verif-v1';
const KDF_ITER = 600000;
const MIN_ITER = 100000;
const COLS = ['casos', 'residentes', 'temario'];
const URL_RE = /^https:\/\/script\.google\.com\/(macros|a\/macros\/[^/]+)\/s\/[\w-]+\/exec$/;

/* ---------------- Estado ---------------- */
const S = {
  key: null, meta: null, joinMeta: null, remember: false,
  cfg: { endpoint: '', token: '', cursor: 0, lastSync: 0, lockMin: 15 },
  casos: new Map(), res: new Map(), tem: new Map(), dirty: new Set(), bad: 0,
  editingId: null, syncing: false, syncState: 'local', syncErr: '',
  lastAct: Date.now(), timers: [], tab: 'nuevo',
  fc: { esp: '', q: '', estado: '', tipo: '', organo: '', subtema: '', mes: '', dir: -1 },
  fr: { esp: '', q: '', residente: '', organo: '', subtema: '', mes: '', dir: -1 },
  fp: { esp: '', organo: '', subtema: '', mes: '', src: 'all', orden: 'prio', n: '20', hide: false, mode: 'casos' },
  ft: { esp: '', mes: '', cov: '' },
  form: { esp: '', mes: '', mod: new Set(), tipo: 'Entrega', organo: '', subtema: '', orgOtro: false, subOtro: false, touched: {} },
  prac: null, importSheets: null, importFile: '', temPreview: null
};
const COL_KEY = { casos: 'casos', residentes: 'res', temario: 'tem' };
const mapOf = col => S[COL_KEY[col]];

/* ---------------- Utilidades ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-');

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

let toastT;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.dataset.err = err ? '1' : '';
  t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), err ? 5000 : 3000);
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Espera…'; btn.disabled = true; }
  else { if (btn.dataset.label) btn.textContent = btn.dataset.label; btn.disabled = false; }
}

/* ---------------- RUT ---------------- */
function rutClean(s) { return String(s ?? '').toUpperCase().replace(/[^0-9K]/g, ''); }
function rutDV(body) {
  let sum = 0, m = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
function rutValid(s) {
  const c = rutClean(s);
  if (c.length < 2) return false;
  const body = c.slice(0, -1), dv = c.slice(-1);
  return /^\d{1,9}$/.test(body) && rutDV(body) === dv;
}
function rutFormat(s) {
  const c = rutClean(s);
  if (c.length < 2) return c;
  const body = c.slice(0, -1).replace(/^0+(?=\d)/, ''), dv = c.slice(-1);
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}

/* ---------------- Fechas (se guardan como AAAA-MM-DD) ---------------- */
function todayIso() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function isoToDisp(iso) { if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''; const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; }
function dispToIso(s) {
  const m = String(s ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
function toIso(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(s)) {          // número de serie de Excel
    const n = Number(v);
    if (n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
    return '';
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return dispToIso(`${iso[3]}-${iso[2]}-${iso[1]}`) || '';
  return dispToIso(s.split(/[\sT]+/)[0]) || '';
}
function hhmm(ts) {
  const d = new Date(ts), now = new Date();
  const t = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return d.toDateString() === now.toDateString() ? t : `${d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })} ${t}`;
}
const fmtDT = ts => (ts ? new Date(ts).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '');

/* ---------------- IndexedDB ---------------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('casos-rad', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('records', { keyPath: 'id' }); d.createObjectStore('meta'); };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), s = t.objectStore(store);
      let out; const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  get(store, key) { return this.tx(store, 'readonly', s => s.get(key)); },
  put(store, val, key) { return this.tx(store, 'readwrite', s => (key === undefined ? s.put(val) : s.put(val, key))); },
  del(store, key) { return this.tx(store, 'readwrite', s => s.delete(key)); },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  putMany(store, vals) { return this.tx(store, 'readwrite', s => { vals.forEach(v => s.put(v)); }); }
};
const saveCfg = () => DB.put('meta', { ...S.cfg }, 'cfg');

/* ---------------- Criptografía ---------------- */
const TE = new TextEncoder(), TD = new TextDecoder();
function b64e(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64d(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
// El prefijo "v1." evita que Google Sheets interprete el texto como fórmula o número.
const pack = buf => 'v1.' + b64e(buf);
const unpack = str => { if (!String(str).startsWith('v1.')) throw new Error('formato'); return b64d(str.slice(3)); };

async function deriveKey(pass, saltB64, iter) {
  if (!(iter >= MIN_ITER)) throw new Error('Parámetros de clave inválidos');
  const base = await crypto.subtle.importKey('raw', TE.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(saltB64), iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJSON(key, obj, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TE.encode(aad) }, key, TE.encode(JSON.stringify(obj)));
  return { iv: pack(iv), ct: pack(ct) };
}
async function decryptJSON(key, iv, ct, aad) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unpack(iv), additionalData: TE.encode(aad) }, key, unpack(ct));
  return JSON.parse(TD.decode(pt));
}
async function verifyKey(key, meta) {
  try { const o = await decryptJSON(key, meta.verIv, meta.verCt, 'verifier'); return o && o.check === VERIF; }
  catch { return false; }
}
// Datos asociados autenticados: ligan el texto cifrado a su id, colección y versión (impide mover o reutilizar registros).
const aadOf = (col, id, t) => `${col}|${id}|${t}`;

/* ---------------- Registros ---------------- */
async function seal(col, p) {
  const { iv, ct } = await encryptJSON(S.key, p, aadOf(col, p.id, p.updatedAt));
  return { id: p.id, col, updatedAt: p.updatedAt, iv, ct, dirty: 1 };
}
function stamp(col, p) {
  const now = Date.now();
  p.updatedAt = Math.max(now, (mapOf(col).get(p.id)?.updatedAt || 0) + 1);
  if (!p.createdAt && !p.deleted) p.createdAt = now;
}
async function saveRecord(col, p) {
  stamp(col, p);
  await DB.put('records', await seal(col, p));
  mapOf(col).set(p.id, p); S.dirty.add(p.id);
  if (col === 'temario') TEM_V++;
  updateSyncPill(); scheduleSync();
}
async function saveMany(col, list) {
  const envs = [];
  for (const p of list) { stamp(col, p); envs.push(await seal(col, p)); }
  await DB.putMany('records', envs);
  for (const p of list) { mapOf(col).set(p.id, p); S.dirty.add(p.id); }
  if (col === 'temario') TEM_V++;
  updateSyncPill(); scheduleSync();
}
async function loadAll() {
  S.casos.clear(); S.res.clear(); S.tem.clear(); S.dirty.clear(); S.bad = 0;
  const recs = await DB.all('records');
  await Promise.all(recs.map(async r => {
    if (!COLS.includes(r.col)) return;
    try {
      const p = await decryptJSON(S.key, r.iv, r.ct, aadOf(r.col, r.id, r.updatedAt));
      mapOf(r.col).set(r.id, p);
      if (r.dirty) S.dirty.add(r.id);
    } catch { S.bad++; }
  }));
  TEM_V++;
}
const live = m => [...m.values()].filter(x => !x.deleted);

/* Clasificación efectiva: lo que el usuario eligió o, si falta, lo que sugieren la taxonomía y el temario. */
const _eff = new Map();
function eff(x) {
  const key = `${x.updatedAt}|${TEM_V}`;
  const c = _eff.get(x.id); if (c && c.key === key) return c.v;
  const text = [x.diagnostico, x.notas].filter(Boolean).join('. ');
  const cls = (!x.organo || !x.subtema) ? classifyText(x.especialidad, text) : { organo: '', subtema: '' };
  const organo = x.organo || cls.organo || '', subtema = x.subtema || cls.subtema || '';
  const m = matchTema(x.especialidad, text, organo, subtema);
  const v = {
    organo, subtema, organoAuto: !x.organo && !!organo, subtemaAuto: !x.subtema && !!subtema,
    mes: String(x.mes || (m && m.tema.mes) || ''), mesAuto: !x.mes && !!(m && m.tema.mes), tema: m ? m.tema : null
  };
  _eff.set(x.id, { key, v });
  return v;
}
const mesLabel = e => (e.mes ? (e.mesAuto ? '≈ Mes ' : 'Mes ') + e.mes : '');

/* ---------------- Sincronización ---------------- */
async function api(action, data = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(S.cfg.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...data, action, token: S.cfg.token }),
      redirect: 'follow', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let j;
    try { j = await r.json(); } catch { throw new Error('Respuesta no válida: revisa que la URL termine en /exec y que el acceso sea "Cualquier persona".'); }
    if (!j.ok) throw new Error(j.error || 'Error del servidor');
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder');
    throw e;
  } finally { clearTimeout(t); }
}

async function applyRemote(r) {
  if (!COLS.includes(r.col)) return false;
  const local = await DB.get('records', r.id);
  if (local && !(r.updatedAt > local.updatedAt) && !(r.updatedAt === local.updatedAt && !local.dirty)) return false;
  let p;
  try { p = await decryptJSON(S.key, r.iv, r.ct, aadOf(r.col, r.id, r.updatedAt)); } catch { S.bad++; return false; }
  if (p.id !== r.id) { S.bad++; return false; }
  await DB.put('records', { id: r.id, col: r.col, updatedAt: r.updatedAt, iv: r.iv, ct: r.ct, dirty: 0 });
  mapOf(r.col).set(r.id, p); S.dirty.delete(r.id);
  if (r.col === 'temario') TEM_V++;
  return true;
}

let syncTimer = null;
function scheduleSync(ms = 1500) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms); }

async function sync() {
  if (!S.key) return;
  if (!S.cfg.endpoint) { S.syncState = 'local'; updateSyncPill(); return; }
  if (S.syncing) { scheduleSync(3000); return; }
  if (!navigator.onLine) { S.syncState = 'offline'; updateSyncPill(); return; }
  S.syncing = true; S.syncState = 'syncing'; updateSyncPill();
  let changed = false;
  try {
    // 1) subir cambios locales
    const dirty = (await DB.all('records')).filter(r => r.dirty);
    for (let i = 0; i < dirty.length; i += 200) {
      const batch = dirty.slice(i, i + 200).map(({ dirty: _d, ...r }) => r);
      const j = await api('push', { records: batch });
      const sent = new Map(batch.map(r => [r.id, r.updatedAt]));
      for (const id of j.applied || []) {
        const l = await DB.get('records', id);
        if (l && l.updatedAt === sent.get(id)) { l.dirty = 0; await DB.put('records', l); S.dirty.delete(id); }
      }
      for (const r of j.newer || []) if (await applyRemote(r)) changed = true;
    }
    // 2) bajar cambios de otros dispositivos
    let more = true, guard = 0;
    while (more && guard++ < 500) {
      const j = await api('pull', { since: S.cfg.cursor || 0 });
      for (const r of j.records) if (await applyRemote(r)) changed = true;
      S.cfg.cursor = j.cursor; more = j.more;
    }
    S.cfg.lastSync = Date.now(); await saveCfg();
    S.syncState = S.dirty.size ? 'pending' : 'ok'; S.syncErr = '';
  } catch (e) {
    S.syncState = navigator.onLine ? 'error' : 'offline'; S.syncErr = e.message;
  } finally {
    S.syncing = false; updateSyncPill();
    if (changed && S.key) renderLists();
    if (S.tab === 'cfg') renderCfg();
  }
}

function updateSyncPill() {
  const el = $('#syncBtn'); if (!el) return;
  const n = S.dirty.size; let st = S.syncState, txt;
  if (!S.cfg.endpoint) { st = 'local'; txt = 'Solo en este dispositivo'; }
  else if (st === 'syncing') txt = 'Sincronizando…';
  else if (st === 'offline') txt = n ? `Sin conexión, ${n} pendiente${n > 1 ? 's' : ''}` : 'Sin conexión';
  else if (st === 'error') txt = 'Error al sincronizar';
  else if (n) { st = 'pending'; txt = `${n} sin sincronizar`; }
  else { st = 'ok'; txt = S.cfg.lastSync ? 'Sincronizado ' + hhmm(S.cfg.lastSync) : 'Sincronizado'; }
  el.dataset.state = st; $('#syncTxt').textContent = txt; el.title = S.syncErr || txt;
}

/* ---------------- Acceso y bloqueo ---------------- */
function showGate(mode, msg = '') {
  document.body.classList.add('locked');
  $('#app').inert = true; $('#gate').hidden = false;
  for (const m of ['connect', 'create', 'unlock']) $('#g-' + m).hidden = m !== mode;
  $('#g-msg').textContent = msg;
  $('#g-back').hidden = !S.joinMeta;
  $$('.gate .err').forEach(e => { e.textContent = ''; });
  if (mode === 'connect') { $('#g-url').value = S.cfg.endpoint || ''; }
  setTimeout(() => { const f = $(`#g-${mode} input`); if (f && matchMedia('(pointer:fine)').matches) f.focus(); }, 60);
}
function hideGate() { document.body.classList.remove('locked'); $('#app').inert = false; $('#gate').hidden = true; }

async function setRemember(on) {
  S.remember = on;
  if (on) await DB.put('meta', S.key, 'key'); else await DB.del('meta', 'key');
}

async function afterUnlock() {
  await loadAll();
  hideGate(); S.lastAct = Date.now();
  renderLists(); showTab(S.tab);
  startTimers(); updateSyncPill(); sync();
  if (S.bad) toast(`${S.bad} registro(s) no se pudieron descifrar y se ignoraron`, true);
}

function lock() {
  S.key = null; S.casos.clear(); S.res.clear(); S.tem.clear(); S.dirty.clear(); S.prac = null; S.temPreview = null; TEM_V++;
  stopTimers(); resetForm(true);
  ['#c-list', '#r-list', '#t-list', '#p-session'].forEach(q => $(q).replaceChildren());
  $$('dialog[open]').forEach(d => d.close());
  showGate('unlock');
}
function startTimers() {
  stopTimers();
  S.timers.push(setInterval(() => {
    if (S.key && !S.remember && Date.now() - S.lastAct > S.cfg.lockMin * 60000) lock();
  }, 15000));
  S.timers.push(setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000));
}
function stopTimers() { S.timers.forEach(clearInterval); S.timers = []; }

/* ---------------- Controles de selección ---------------- */
function buildChoice(container, opts, get, set, { seg = false, esp = false, chipCls = '' } = {}) {
  container.replaceChildren(...opts.map(o => {
    const b = h('button', { type: 'button', class: seg ? '' : 'chip' + (esp ? ' esp' : '') + (chipCls ? ' ' + chipCls : ''), 'data-v': o.value, 'aria-pressed': 'false' }, o.label);
    if (esp) b.style.setProperty('--esp', espColor(o.value));
    b.addEventListener('click', () => { set(o.value); refreshChoice(container, get); });
    return b;
  }));
  container._get = get;
  refreshChoice(container, get);
}
function refreshChoice(container, get = container._get) {
  const cur = get();
  for (const b of container.children) {
    const on = cur instanceof Set ? cur.has(b.dataset.v) : cur === b.dataset.v;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
function refreshForm() {
  ['#f-esp', '#f-mes', '#f-mod', '#f-tipo', '#f-org', '#f-sub'].forEach(s => { const el = $(s); if (el && el._get) refreshChoice(el); });
  syncOtro();
}

/* ---------------- Formulario ---------------- */
function initForm() {
  const F = S.form;
  buildChoice($('#f-esp'), ESPECIALIDADES.map(e => ({ value: e, label: e })), () => F.esp, v => { F.esp = F.esp === v ? '' : v; onEspChange(); }, { esp: true });
  buildChoice($('#f-mes'), [{ value: '', label: 'Sin definir' }, ...MESES.map(m => ({ value: m, label: 'Mes ' + m }))], () => F.mes, v => { F.mes = v; F.touched.mes = true; autoClassify(); }, { seg: true });
  buildChoice($('#f-mod'), MODALIDADES.map(m => ({ value: m, label: m })), () => F.mod, v => { F.mod.has(v) ? F.mod.delete(v) : F.mod.add(v); });
  buildChoice($('#f-tipo'), TIPOS.map(t => ({ value: t, label: t })), () => F.tipo, v => { F.tipo = v; }, { seg: true });
  buildOrgSub();

  $('#f-org-otro').addEventListener('input', e => { F.organo = e.target.value.trim(); F.touched.organo = true; autoLater(); });
  $('#f-sub-otro').addEventListener('input', e => { F.subtema = e.target.value.trim(); F.touched.subtema = true; autoLater(); });
  $('#f-dx').addEventListener('input', autoLater);
  $('#f-notas').addEventListener('input', autoLater);

  const txt = $('#f-fecha'), pick = $('#f-fecha-pick');
  txt.addEventListener('input', () => {
    const d = txt.value.replace(/\D/g, '').slice(0, 8);
    const out = d.length > 4 ? `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
    if (txt.value !== out) txt.value = out;
    const iso = dispToIso(out);
    pick.value = iso || '';
    txt.toggleAttribute('aria-invalid', d.length === 8 && !iso);
  });
  pick.addEventListener('change', () => { txt.value = isoToDisp(pick.value); txt.removeAttribute('aria-invalid'); });
  pick.addEventListener('click', () => { if (matchMedia('(pointer:fine)').matches) { try { pick.showPicker(); } catch { /* sin showPicker */ } } });
  $('#f-hoy').addEventListener('click', () => { pick.value = todayIso(); txt.value = isoToDisp(pick.value); txt.removeAttribute('aria-invalid'); });

  const rut = $('#f-rut');
  rut.addEventListener('input', rutHint);
  rut.addEventListener('blur', () => { if (rutValid(rut.value)) rut.value = rutFormat(rut.value); });

  $('#caseForm').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
  $('#caseForm').addEventListener('submit', onSubmit);
  $('#cancelEdit').addEventListener('click', () => { const back = !!S.editingId; resetForm(); if (back) showTab('casos'); });
}

function buildOrgSub() {
  const F = S.form, has = !!F.esp;
  $('#fs-org').hidden = !has; $('#fs-sub').hidden = !has;
  if (!has) return;
  const opts = list => [...list.map(o => ({ value: o, label: o })), { value: '__otro', label: 'Otro…' }];
  buildChoice($('#f-org'), opts(organosDe(F.esp)), () => (F.orgOtro ? '__otro' : F.organo), v => {
    F.touched.organo = true;
    if (v === '__otro') { F.orgOtro = !F.orgOtro; F.organo = F.orgOtro ? $('#f-org-otro').value.trim() : ''; if (F.orgOtro) setTimeout(() => $('#f-org-otro').focus(), 30); }
    else { F.orgOtro = false; F.organo = F.organo === v ? '' : v; }
    autoClassify();
  }, { chipCls: 'sm' });
  buildChoice($('#f-sub'), opts(subtemasDe(F.esp)), () => (F.subOtro ? '__otro' : F.subtema), v => {
    F.touched.subtema = true;
    if (v === '__otro') { F.subOtro = !F.subOtro; F.subtema = F.subOtro ? $('#f-sub-otro').value.trim() : ''; if (F.subOtro) setTimeout(() => $('#f-sub-otro').focus(), 30); }
    else { F.subOtro = false; F.subtema = F.subtema === v ? '' : v; }
    autoClassify();
  }, { chipCls: 'sm' });
  syncOtro();
}
function syncOtro() {
  const F = S.form, o = $('#f-org-otro'), s = $('#f-sub-otro');
  o.hidden = !F.orgOtro; s.hidden = !F.subOtro;
  if (F.orgOtro && document.activeElement !== o) o.value = F.organo;
  if (F.subOtro && document.activeElement !== s) s.value = F.subtema;
}
function onEspChange() {
  const F = S.form;
  if (!F.orgOtro && F.organo && !organosDe(F.esp).includes(F.organo)) { F.organo = ''; F.touched.organo = false; }
  if (!F.subOtro && F.subtema && !subtemasDe(F.esp).includes(F.subtema)) { F.subtema = ''; F.touched.subtema = false; }
  buildOrgSub(); autoClassify();
}
let _autoT;
function autoLater() { clearTimeout(_autoT); _autoT = setTimeout(autoClassify, 250); }
function autoClassify() {
  const F = S.form, hint = $('#dxHint'), mh = $('#mesHint');
  const text = [$('#f-dx').value, $('#f-notas').value].map(s => s.trim()).filter(Boolean).join('. ');
  if (!F.esp) { hint.textContent = ''; mh.textContent = ''; refreshForm(); return; }
  const cls = classifyText(F.esp, text);
  if (!F.touched.organo) { F.orgOtro = false; F.organo = cls.organo; }
  if (!F.touched.subtema) { F.subOtro = false; F.subtema = cls.subtema; }
  const m = text ? matchTema(F.esp, text, F.organo, F.subtema) : null;
  if (!F.touched.mes) F.mes = m && m.tema.mes ? String(m.tema.mes) : '';
  const auto = [];
  if (!F.touched.organo && F.organo) auto.push(F.organo);
  if (!F.touched.subtema && F.subtema) auto.push(F.subtema);
  hint.textContent = auto.length ? `Clasificado automáticamente: ${auto.join(', ')}. Toca otra opción si no corresponde.` : '';
  const hasTem = live(S.tem).some(t => t.especialidad === F.esp);
  if (m) mh.textContent = `Según el temario${m.tema.mes ? `, mes ${m.tema.mes}` : ''}: «${m.tema.tema}»` + (F.touched.mes && m.tema.mes && String(m.tema.mes) !== F.mes ? '. Elegiste otro mes.' : '');
  else mh.textContent = !text ? '' : hasTem ? 'Sin coincidencia clara con el temario.' : 'Carga el temario de esta especialidad (en Práctica) para sugerir el mes.';
  refreshForm();
}

function rutHint() {
  const v = $('#f-rut').value, c = rutClean(v), el = $('#rutHint');
  el.className = 'hint'; el.textContent = '';
  $('#f-rut').removeAttribute('aria-invalid');
  if (c.length < 7) return;
  if (!rutValid(v)) { el.textContent = 'El dígito verificador no calza'; el.classList.add('warn'); return; }
  const mine = live(S.casos).filter(x => rutClean(x.rut) === c && x.id !== S.editingId).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const res = live(S.res).filter(x => rutClean(x.rut) === c).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const parts = [];
  if (mine.length) parts.push(`Ya tienes ${mine.length} caso${mine.length > 1 ? 's' : ''} con este RUT (último: ${isoToDisp(mine[0].fecha)}, ${mine[0].especialidad})`);
  if (res.length) parts.push(`Mostrado por ${res[0].residente || 'un residente'}${res[0].fecha ? ' el ' + isoToDisp(res[0].fecha) : ''}${res.length > 1 ? ` y ${res.length - 1} vez/veces más` : ''}`);
  if (parts.length) { el.textContent = parts.join('. ') + '.'; el.classList.add('info'); }
  else el.textContent = 'RUT válido';
}

async function onSubmit(ev) {
  ev.preventDefault();
  const F = S.form, rutEl = $('#f-rut'), fEl = $('#f-fecha');
  const rutRaw = rutEl.value, iso = dispToIso(fEl.value);
  if (rutClean(rutRaw).length < 2) { rutEl.setAttribute('aria-invalid', ''); rutEl.focus(); return toast('Ingresa el RUT', true); }
  if (!iso) { fEl.setAttribute('aria-invalid', ''); fEl.focus(); return toast('Ingresa la fecha del examen (dd-mm-aaaa)', true); }
  if (!F.esp) { $('#f-esp').scrollIntoView({ block: 'center', behavior: 'smooth' }); return toast('Elige la especialidad', true); }
  if (!rutValid(rutRaw) && !confirm('El dígito verificador del RUT no calza. ¿Guardar igual?')) return;

  const wasEdit = !!S.editingId;
  const p = wasEdit ? { ...S.casos.get(S.editingId) } : { id: 'c_' + crypto.randomUUID(), mostrado: false, mostradoEn: '', deleted: false };
  Object.assign(p, {
    rut: rutValid(rutRaw) ? rutFormat(rutRaw) : rutRaw.trim(),
    fecha: iso, especialidad: F.esp, mes: F.mes, organo: F.organo, subtema: F.subtema,
    modalidades: MODALIDADES.filter(m => F.mod.has(m)),
    tipo: F.tipo, diagnostico: $('#f-dx').value.trim(), notas: $('#f-notas').value.trim()
  });
  const btn = $('#saveBtn'); busy(btn, true, 'Guardando…');
  try { await saveRecord('casos', p); }
  catch (e) { toast('No se pudo guardar: ' + e.message, true); return; }
  finally { busy(btn, false); }
  toast(wasEdit ? 'Cambios guardados' : 'Caso guardado');
  resetForm();
  renderCasos();
  if (wasEdit) showTab('casos');
  else if (matchMedia('(pointer:fine)').matches) $('#f-rut').focus();
}

function resetForm(full = false) {
  const wasEdit = !!S.editingId;
  S.editingId = null;
  $('#caseForm').reset(); $('#f-fecha-pick').value = '';
  $$('#caseForm [aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
  const F = S.form, keepMes = !full && !wasEdit && F.touched.mes;   // un mes elegido a mano se mantiene para el caso siguiente
  F.mod = new Set(); F.tipo = 'Entrega'; F.organo = ''; F.subtema = ''; F.orgOtro = false; F.subOtro = false;
  F.touched = keepMes ? { mes: true } : {};
  if (!keepMes) F.mes = '';
  if (full) F.esp = '';
  buildOrgSub(); refreshForm();
  $('#saveBtn').textContent = 'Guardar caso'; $('#cancelEdit').hidden = true;
  $('#rutHint').textContent = ''; $('#rutHint').className = 'hint';
  $('#dxHint').textContent = ''; $('#mesHint').textContent = '';
  if (S.tab === 'nuevo') $('#title').textContent = 'Nuevo caso';
}

function editCase(id) {
  const x = S.casos.get(id); if (!x) return;
  S.editingId = id;
  $('#f-rut').value = x.rut; $('#f-fecha').value = isoToDisp(x.fecha); $('#f-fecha-pick').value = x.fecha;
  const F = S.form;
  F.esp = x.especialidad; F.mes = String(x.mes || ''); F.mod = new Set(x.modalidades || []); F.tipo = x.tipo || 'Entrega';
  F.organo = x.organo || ''; F.subtema = x.subtema || '';
  F.orgOtro = !!F.organo && !organosDe(F.esp).includes(F.organo);
  F.subOtro = !!F.subtema && !subtemasDe(F.esp).includes(F.subtema);
  F.touched = { organo: !!F.organo, subtema: !!F.subtema, mes: !!F.mes };
  $('#f-dx').value = x.diagnostico || ''; $('#f-notas').value = x.notas || '';
  buildOrgSub();
  $('#saveBtn').textContent = 'Guardar cambios'; $('#cancelEdit').hidden = false;
  showTab('nuevo'); rutHint(); autoClassify();
}

/* ---------------- Búsqueda y filtros ---------------- */
function haystack(x, extra = '') {
  return norm([x.rut, rutClean(x.rut), isoToDisp(x.fecha), x.fecha, x.especialidad, (x.modalidades || []).join(' '),
    x.tipo, x.diagnostico, x.notas, x.mes ? 'mes ' + x.mes : '', extra].join(' '));
}
function matchQ(x, q, extra) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const H = haystack(x, extra), R = rutClean(x.rut);
  return terms.every(t => {
    if (H.includes(t)) return true;
    const tc = t.toUpperCase().replace(/[^0-9K]/g, '');
    return tc.length >= 4 && /\d/.test(tc) && R.includes(tc);
  });
}
const extraOf = (e, more = '') => `${e.organo} ${e.subtema} ${mesLabel(e)} ${more}`;
const byFecha = dir => (a, b) => ((a.fecha || '0000') < (b.fecha || '0000') ? -1 : (a.fecha || '0000') > (b.fecha || '0000') ? 1 : 0) * dir
  || ((a.createdAt || 0) - (b.createdAt || 0)) * dir;

function renderEspBar(el, f, items, rerender) {
  const counts = {};
  for (const x of items) counts[x.especialidad || ''] = (counts[x.especialidad || ''] || 0) + 1;
  const extra = Object.keys(counts).filter(e => !ESPECIALIDADES.includes(e)).sort();
  const opts = [{ v: '', label: 'Todas', n: items.length, all: true },
    ...ESPECIALIDADES.map(e => ({ v: e, label: e, n: counts[e] || 0 })),
    ...extra.map(e => ({ v: e, label: e || 'Sin especialidad', n: counts[e] }))];
  if (f.esp && !opts.some(o => o.v === f.esp && !o.all)) f.esp = '';
  el.replaceChildren(...opts.map(o => {
    const sel = o.all ? f.esp === '' : f.esp === o.v;
    const b = h('button', { type: 'button', class: 'chip' + (o.all ? '' : ' esp') + (!o.n && !sel && !o.all ? ' empty' : ''), 'aria-pressed': String(sel),
      onclick: () => { f.esp = o.all ? '' : o.v; f.organo = ''; f.subtema = ''; rerender(); } }, o.label, ' ', h('span', { class: 'cnt' }, String(o.n)));
    if (!o.all) b.style.setProperty('--esp', espColor(o.v));
    return b;
  }));
  const sel = el.querySelector('[aria-pressed=true]');     // mantiene visible la especialidad elegida
  if (sel && el.scrollWidth > el.clientWidth) {
    const a = el.getBoundingClientRect(), c = sel.getBoundingClientRect();
    if (c.left < a.left || c.right > a.right) el.scrollLeft += c.left - a.left - 16;
  }
}
function fillSelect(sel, allLabel, values, cur, label = v => v, extra = []) {
  sel.replaceChildren(h('option', { value: '' }, allLabel), ...values.map(v => h('option', { value: v }, label(v))), ...extra.map(([v, l]) => h('option', { value: v }, l)));
  const ok = cur === '' || values.includes(cur) || extra.some(e => e[0] === cur);
  sel.value = ok ? cur : '';
  return sel.value;
}
function orderedVals(list, order) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, 'es');
  });
}
const taxOrder = (esp, kind) => (esp ? (kind === 'o' ? organosDe(esp) : subtemasDe(esp)) : ESPECIALIDADES.flatMap(e => (kind === 'o' ? organosDe(e) : subtemasDe(e))));
const mesVals = list => [...new Set(list.filter(Boolean).map(String))].sort((a, b) => Number(a) - Number(b));
/** Filtra por especialidad, órgano, subtema y mes (valores efectivos) y actualiza los selectores. */
function facetFilter(items, f, ids) {
  const base = items.filter(x => f.esp === '' || x.especialidad === f.esp);
  const E = new Map(base.map(x => [x.id, eff(x)]));
  const ev = [...E.values()];
  f.organo = fillSelect($(ids.org), 'Órganos', orderedVals(ev.map(e => e.organo), taxOrder(f.esp, 'o')), f.organo);
  f.subtema = fillSelect($(ids.sub), 'Subtemas', orderedVals(ev.map(e => e.subtema), taxOrder(f.esp, 's')), f.subtema);
  f.mes = fillSelect($(ids.mes), 'Meses', mesVals(ev.map(e => e.mes)), f.mes, v => 'Mes ' + v, ev.some(e => !e.mes) ? [['_', 'Sin mes']] : []);
  const list = base.filter(x => {
    const e = E.get(x.id);
    return (!f.organo || e.organo === f.organo) && (!f.subtema || e.subtema === f.subtema)
      && (!f.mes || (f.mes === '_' ? !e.mes : e.mes === f.mes));
  });
  return { list, E };
}
function setActiveCount(el, n) { el.textContent = n ? String(n) : ''; el.hidden = !n; }

/* ---------------- Mis casos ---------------- */
function renderCasos() {
  const f = S.fc, all = live(S.casos);
  renderEspBar($('#c-esp'), f, all, renderCasos);
  const { list, E } = facetFilter(all, f, { org: '#c-org', sub: '#c-sub', mes: '#c-mes' });
  const arr = list.filter(x => (!f.tipo || x.tipo === f.tipo) && (f.estado !== 'pend' || !x.mostrado) && (f.estado !== 'most' || x.mostrado)
    && matchQ(x, f.q, extraOf(E.get(x.id)))).sort(byFecha(f.dir));
  setActiveCount($('#c-nf'), [f.organo, f.subtema, f.mes, f.estado, f.tipo].filter(Boolean).length);
  const shown = arr.filter(x => x.mostrado).length;
  $('#c-count').textContent = arr.length ? `${arr.length} caso${arr.length > 1 ? 's' : ''}, ${shown} mostrado${shown === 1 ? '' : 's'}` : '';
  $('#c-orden').textContent = f.dir < 0 ? 'Más recientes primero' : 'Más antiguos primero';
  const listEl = $('#c-list');
  if (!arr.length) {
    listEl.replaceChildren(h('li', { class: 'empty-state' }, all.length ? 'Ningún caso coincide con estos filtros.' : 'Aún no hay casos. Agrega el primero en Nuevo.'));
    return;
  }
  listEl.replaceChildren(...arr.map((x, i) => caseRow(x, i + 1, E.get(x.id))));
}
function caseRow(x, n, e) {
  const cb = h('input', { type: 'checkbox', 'aria-label': `Caso ${n} mostrado en entrega` });
  cb.checked = !!x.mostrado;
  cb.addEventListener('change', async () => {
    const p = { ...S.casos.get(x.id), mostrado: cb.checked, mostradoEn: cb.checked ? todayIso() : '' };
    await saveRecord('casos', p);
    renderCasos();
  });
  return h('li', { class: 'row' + (x.mostrado ? ' done' : ''), style: { '--esp': espColor(x.especialidad) } },
    h('div', { class: 'lead' }, h('span', { class: 'num' }, String(n)), cb),
    h('button', { type: 'button', class: 'rbody', onclick: () => openCaseDetail(x.id) },
      h('div', { class: 'l1' },
        h('span', { class: 'date' }, isoToDisp(x.fecha)),
        h('span', { class: 'rut' }, x.rut),
        (x.modalidades || []).length ? h('span', { class: 'mods' }, x.modalidades.join(' + ')) : null,
        x.tipo ? h('span', { class: 'tipo' }, x.tipo) : null),
      h('div', { class: 'dx' }, x.diagnostico || 'Sin diagnóstico'),
      h('div', { class: 'meta' }, [x.especialidad, e.organo, e.subtema, mesLabel(e),
        x.mostrado ? 'Mostrado' + (x.mostradoEn ? ' ' + isoToDisp(x.mostradoEn) : '') : ''].filter(Boolean).join(', '))));
}

function openDetail(title, rows, actions) {
  const d = $('#detail');
  d.replaceChildren(h('div', { class: 'dlg' },
    h('h2', {}, title),
    h('dl', { class: 'kv' }, ...rows.filter(r => r[1]).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    h('div', { class: 'dlg-actions' }, ...actions, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cerrar'))));
  d.showModal();
}
function copyText(t, label) {
  navigator.clipboard.writeText(t).then(() => toast(label + ' copiado')).catch(() => toast('No se pudo copiar', true));
}
const autoTag = (v, auto) => (v ? v + (auto ? ' (automático)' : '') : '');
const pracTxt = x => (x.practica ? `${x.practica.ok} acierto${x.practica.ok === 1 ? '' : 's'}, ${x.practica.fail} error${x.practica.fail === 1 ? '' : 'es'}` : '');
function openCaseDetail(id) {
  const x = S.casos.get(id); if (!x) return;
  const e = eff(x), c = rutClean(x.rut);
  const byRes = live(S.res).filter(r => rutClean(r.rut) === c).map(r => `${r.residente || 'Residente'}${r.fecha ? ', ' + isoToDisp(r.fecha) : ''}`).join('\n');
  openDetail(x.diagnostico || 'Caso sin diagnóstico', [
    ['Fecha del examen', isoToDisp(x.fecha)], ['RUT', x.rut], ['Especialidad', x.especialidad],
    ['Órgano', autoTag(e.organo, e.organoAuto)], ['Subtema', autoTag(e.subtema, e.subtemaAuto)],
    ['Mes de rotación', e.mes ? 'Mes ' + e.mes + (e.mesAuto ? ' (según temario)' : '') : ''],
    ['Tema del temario', e.tema ? e.tema.tema : ''],
    ['Modalidad', (x.modalidades || []).join(', ')], ['Tipo', x.tipo], ['Notas', x.notas],
    ['Mostrado', x.mostrado ? 'Sí' + (x.mostradoEn ? ', ' + isoToDisp(x.mostradoEn) : '') : 'No'],
    ['Mostrado por residentes', byRes], ['Práctica', pracTxt(x)], ['Registrado', fmtDT(x.createdAt)]
  ], [
    h('button', { type: 'button', class: 'btn primary', onclick: () => { $('#detail').close(); editCase(id); } }, 'Editar'),
    h('button', { type: 'button', class: 'btn', onclick: () => copyText(x.rut, 'RUT') }, 'Copiar RUT'),
    h('button', { type: 'button', class: 'btn danger', onclick: async () => {
      if (!confirm('¿Eliminar este caso? Se eliminará en todos tus dispositivos.')) return;
      await saveRecord('casos', { id, deleted: true });
      $('#detail').close(); renderCasos(); toast('Caso eliminado');
    } }, 'Eliminar')
  ]);
}

/* ---------------- Casos de residentes ---------------- */
function renderRes() {
  const f = S.fr, all = live(S.res);
  renderEspBar($('#r-esp'), f, all, renderRes);
  const names = [...new Set(all.map(x => x.residente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  f.residente = fillSelect($('#r-resid'), 'Residentes', names, f.residente);
  const { list, E } = facetFilter(all, f, { org: '#r-org', sub: '#r-sub', mes: '#r-mes' });
  const mine = new Set(live(S.casos).map(x => rutClean(x.rut)));
  const arr = list.filter(x => (!f.residente || x.residente === f.residente) && matchQ(x, f.q, extraOf(E.get(x.id), x.residente))).sort(byFecha(f.dir));
  setActiveCount($('#r-nf'), [f.residente, f.organo, f.subtema, f.mes].filter(Boolean).length);
  $('#r-count').textContent = arr.length ? `${arr.length} caso${arr.length > 1 ? 's' : ''}` : '';
  $('#r-orden').textContent = f.dir < 0 ? 'Más recientes primero' : 'Más antiguos primero';
  const listEl = $('#r-list');
  if (!arr.length) {
    listEl.replaceChildren(h('li', { class: 'empty-state' }, all.length ? 'Ningún caso coincide con estos filtros.' : 'Importa el Excel de casos de residentes para buscarlos aquí.'));
    return;
  }
  listEl.replaceChildren(...arr.map((x, i) => {
    const e = E.get(x.id);
    return h('li', { class: 'row', style: { '--esp': espColor(x.especialidad) } },
      h('div', { class: 'lead' }, h('span', { class: 'num' }, String(i + 1))),
      h('button', { type: 'button', class: 'rbody', onclick: () => openResDetail(x.id) },
        h('div', { class: 'l1' },
          h('span', { class: 'date' }, x.fecha ? isoToDisp(x.fecha) : 'Sin fecha'),
          h('span', { class: 'rut' }, x.rut),
          (x.modalidades || []).length ? h('span', { class: 'mods' }, x.modalidades.join(' + ')) : null,
          x.tipo ? h('span', { class: 'tipo' }, x.tipo) : null,
          mine.has(rutClean(x.rut)) ? h('span', { class: 'badge' }, 'En tus casos') : null),
        h('div', { class: 'dx' }, x.diagnostico || 'Sin diagnóstico'),
        h('div', { class: 'meta' }, [x.especialidad, e.organo, e.subtema, mesLabel(e), x.residente].filter(Boolean).join(', '))));
  }));
}
function openResDetail(id) {
  const x = S.res.get(id); if (!x) return;
  const e = eff(x);
  openDetail(x.diagnostico || 'Caso sin diagnóstico', [
    ['Residente', x.residente], ['Fecha del estudio', isoToDisp(x.fecha)], ['RUT', x.rut], ['Especialidad', x.especialidad],
    ['Órgano', autoTag(e.organo, e.organoAuto)], ['Subtema', autoTag(e.subtema, e.subtemaAuto)],
    ['Mes de rotación', e.mes ? 'Mes ' + e.mes + (e.mesAuto ? ' (según temario)' : '') : ''], ['Tema del temario', e.tema ? e.tema.tema : ''],
    ['Modalidad', (x.modalidades || []).join(', ')], ['Tipo', x.tipo], ['Práctica', pracTxt(x)], ['Importado de', x.fuente]
  ], [
    h('button', { type: 'button', class: 'btn', onclick: () => copyText(x.rut, 'RUT') }, 'Copiar RUT'),
    h('button', { type: 'button', class: 'btn danger', onclick: async () => {
      if (!confirm('¿Eliminar este caso de la lista de residentes?')) return;
      await saveRecord('residentes', { id, deleted: true });
      $('#detail').close(); renderRes(); toast('Caso eliminado');
    } }, 'Eliminar')
  ]);
}
/* ---------- Normalización al importar ---------- */
function patHit(text, p) {
  const t = norm(text);
  return p.length <= 3 ? new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(t) : t.includes(p);
}
const ESP_SYN = [
  ['Ecografía Doppler', ['doppler']], ['Neurorradiología', ['neuro']], ['Musculoesquelético', ['msk', 'musculo', 'osteo', 'mme']],
  ['Pediatría', ['pediatr', 'ped', 'infantil']], ['Imágenes mamarias', ['mama', 'mamari', 'breast']],
  ['Digestivo', ['digestiv', 'gastro', 'fluoro']], ['Intervencional', ['interven', 'ir', 'vascular']],
  ['Negato', ['negato', 'rx', 'radiografia', 'simple']], ['TC de cuerpo', ['tc', 'tac', 'tomografia', 'body ct']],
  ['MR de cuerpo', ['mr', 'rm', 'rnm', 'resonancia']], ['Ecografía gris', ['gris', 'eco', 'ecografia', 'us', 'ultrasonido']]
];
function normEsp(v) {
  const s = String(v ?? '').trim(); if (!s) return '';
  const exact = ESPECIALIDADES.find(e => norm(e) === norm(s)); if (exact) return exact;
  for (const [name, pats] of ESP_SYN) if (pats.some(p => patHit(s, p))) return name;
  return s;
}
const MOD_SYN = [
  ['Eco Doppler', ['doppler']], ['PET-TC', ['pet']], ['Mamografía', ['mamo', 'mamografia', 'tomosintesis']],
  ['Medicina nuclear', ['nuclear', 'spect', 'cintigrafia', 'gammagrafia', 'mn']], ['Angiografía', ['angiografia', 'dsa']],
  ['Fluoroscopía', ['fluoro', 'radioscopia', 'fluoroscopia']], ['RM', ['rm', 'mr', 'rnm', 'resonancia', 'mri']],
  ['TC', ['tc', 'tac', 'ct', 'scanner', 'angiotc', 'angio-tc']], ['Eco', ['eco', 'us', 'ecografia', 'ultrasonido']],
  ['Rx', ['rx', 'radiografia', 'placa']]
];
function normMods(v) {
  const s = String(v ?? '').trim(); if (!s) return [];
  const out = [];
  for (const tok of s.split(/[/,+;&]|\s+y\s+|\s+-\s+/).map(t => t.trim()).filter(Boolean)) {
    const hit = MOD_SYN.find(([, pats]) => pats.some(p => patHit(tok, p)));
    const val = hit ? hit[0] : tok;
    if (!out.includes(val)) out.push(val);
  }
  return out;
}
function normTipo(v) {
  const s = String(v ?? '').trim(), n = norm(s); if (!n) return '';
  if (/(^|[^a-z])fu([^a-z]|$)|follow/.test(n)) return 'FU';
  if (n.includes('entrega')) return 'Entrega';
  if (n.includes('seguim')) return 'Seguimiento';
  return s;
}
const dedupKey = x => `${rutClean(x.rut)}|${x.fecha}|${norm(x.diagnostico)}`;

const IMPORT_FIELDS = [
  { k: 'rut', label: 'RUT', pats: ['rut', 'run'] },
  { k: 'fecha', label: 'Fecha de estudio', pats: ['fecha'] },
  { k: 'tipo', label: 'Entrega o FU', pats: ['entrega', 'fu', 'follow', 'tipo'] },
  { k: 'especialidad', label: 'Especialidad', pats: ['especialidad', 'rotacion', 'seccion', 'area'] },
  { k: 'diagnostico', label: 'Diagnóstico', pats: ['diagnostico', 'dx', 'hallazgo'] },
  { k: 'modalidad', label: 'Modalidad', pats: ['modalidad', 'modality', 'tecnica'] },
  { k: 'residente', label: 'Residente', pats: ['residente', 'becado', 'nombre', 'presenta', 'presentador'] }
];
const headerField = hd => IMPORT_FIELDS.find(f => f.pats.some(p => patHit(hd, p)))?.k || null;
function guessMap(headers) {
  const used = new Set(), map = {};
  for (const f of IMPORT_FIELDS) {
    const i = headers.findIndex((hd, idx) => hd && !used.has(idx) && f.pats.some(p => patHit(hd, p)));
    map[f.k] = i; if (i >= 0) used.add(i);
  }
  return map;
}
function prepSheet(s) {
  let best = -1, score = 1;
  for (let i = 0; i < Math.min(25, s.rows.length); i++) {
    const sc = (s.rows[i] || []).filter(c => typeof c === 'string' && headerField(c)).length;
    if (sc > score) { score = sc; best = i; }
  }
  if (best < 0) return null;
  const headers = s.rows[best].map(c => String(c ?? '').trim());
  const map = guessMap(headers);
  const rows = s.rows.slice(best + 1).filter(r => r && r.some(c => String(c ?? '').trim() !== ''));
  return { name: s.name, headers, map, rows, include: map.rut >= 0 && rows.length > 0 };
}

/* ---------- Lector de .xlsx sin dependencias (ZIP + XML) ---------- */
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('El archivo no es un documento de Office válido (ZIP)');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
    files[td.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, loff };
    p += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name]; if (!f) return null;
      const start = f.loff + 30 + dv.getUint16(f.loff + 26, true) + dv.getUint16(f.loff + 28, true);
      const data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return td.decode(data);
      if (f.method !== 8) throw new Error('Compresión no soportada en el archivo');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return td.decode(new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  };
}
const elems = node => [...node.childNodes].filter(c => c.nodeType === 1);
const byTag = (node, tag) => [...node.getElementsByTagName(tag)];
function colIndex(ref) { let n = 0; for (const ch of ref.match(/^[A-Z]+/)[0]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
async function readXlsx(buf, Parser = DOMParser) {
  const z = await unzip(buf), P = new Parser();
  const xml = async name => { const t = await z.text(name); return t ? P.parseFromString(t, 'text/xml') : null; };
  const wb = await xml('xl/workbook.xml'), rels = await xml('xl/_rels/workbook.xml.rels'), ss = await xml('xl/sharedStrings.xml');
  if (!wb || !rels) throw new Error('El archivo no parece un libro de Excel');
  const strings = ss ? byTag(ss, 'si').map(si => elems(si).map(ch => ch.localName === 't' ? ch.textContent
    : ch.localName === 'r' ? elems(ch).filter(t => t.localName === 't').map(t => t.textContent).join('') : '').join('')) : [];
  const relMap = {}; for (const r of byTag(rels, 'Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  const out = [];
  for (const s of byTag(wb, 'sheet')) {
    let target = relMap[s.getAttribute('r:id')]; if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const doc = await xml(target); if (!doc) continue;
    const rows = [];
    for (const row of byTag(doc, 'row')) {
      const ri = (Number(row.getAttribute('r')) || rows.length + 1) - 1, arr = [];
      let ci = 0;
      for (const c of elems(row).filter(e => e.localName === 'c')) {
        const ref = c.getAttribute('r'); if (ref) ci = colIndex(ref);
        const t = c.getAttribute('t'), vEl = elems(c).find(e => e.localName === 'v');
        let v = '';
        if (t === 's') v = vEl ? strings[Number(vEl.textContent)] ?? '' : '';
        else if (t === 'inlineStr') v = byTag(c, 't').map(x => x.textContent).join('');
        else if (t === 'str') v = vEl ? vEl.textContent : '';
        else if (t === 'b') v = vEl ? vEl.textContent === '1' : '';
        else if (t === 'e') v = '';
        else v = vEl ? Number(vEl.textContent) : '';
        arr[ci] = v; ci++;
      }
      rows[ri] = Array.from(arr, x => x ?? '');
    }
    out.push({ name: s.getAttribute('name') || 'Hoja', rows: Array.from(rows, r => r || []) });
  }
  return out;
}
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [';', ',', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function onImportFile(file) {
  try {
    const n = file.name.toLowerCase();
    let sheets;
    if (/\.xls[xm]$/.test(n)) sheets = await readXlsx(await file.arrayBuffer());
    else if (/\.(csv|tsv|txt)$/.test(n)) sheets = [{ name: file.name.replace(/\.[^.]+$/, ''), rows: parseCSV(await file.text()) }];
    else throw new Error('Usa un archivo .xlsx o .csv. Si es un .xls antiguo, guárdalo como .xlsx.');
    const prepared = sheets.map(prepSheet).filter(Boolean);
    if (!prepared.length) throw new Error('No encontré encabezados reconocibles (RUT, Fecha, Diagnóstico…)');
    S.importSheets = prepared; S.importFile = file.name;
    openImportDialog();
  } catch (e) { toast(e.message, true); }
  finally { $('#r-file').value = ''; }
}
function openImportDialog() {
  const d = $('#impDlg'), multi = S.importSheets.length > 1;
  const blocks = S.importSheets.map(s => {
    const inc = h('input', { type: 'checkbox' }); inc.checked = s.include;
    inc.addEventListener('change', () => { s.include = inc.checked; });
    if (multi && s.map.residente < 0) s.map.residente = 'sheet';
    const rows = IMPORT_FIELDS.map(f => {
      const sel = h('select', { 'aria-label': `${f.label} en ${s.name}` },
        h('option', { value: '-1' }, 'No usar'),
        f.k === 'residente' ? h('option', { value: 'sheet' }, 'Nombre de la hoja') : null,
        ...s.headers.map((hd, i) => (hd ? h('option', { value: String(i) }, hd) : null)));
      sel.value = String(s.map[f.k]);
      sel.addEventListener('change', () => { s.map[f.k] = sel.value === 'sheet' ? 'sheet' : Number(sel.value); });
      return h('label', { class: 'maprow' }, h('span', {}, f.label), sel);
    });
    return h('fieldset', { class: 'impsheet' },
      h('legend', {}, h('label', { class: 'check' }, inc, ` ${s.name} (${s.rows.length} fila${s.rows.length === 1 ? '' : 's'})`)),
      h('div', { class: 'mapgrid' }, ...rows));
  });
  d.replaceChildren(h('div', { class: 'dlg' },
    h('h2', {}, 'Importar casos de residentes'),
    h('p', { class: 'muted' }, `${S.importFile}: revisa qué columna corresponde a cada dato. Lo que quede en «No usar» (como Aporte) no se importa, y se omiten los casos ya importados (mismo RUT, fecha y diagnóstico).`),
    ...blocks,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: e => doImport(e.currentTarget) }, 'Importar'))));
  d.showModal();
}
async function doImport(btn) {
  const existing = new Set(live(S.res).map(dedupKey));
  const list = []; let dup = 0, noRut = 0;
  for (const s of S.importSheets) {
    if (!s.include) continue;
    const g = (row, k) => { const m = s.map[k]; return m === 'sheet' ? s.name : m >= 0 ? row[m] : ''; };
    for (const row of s.rows) {
      const rutRaw = String(g(row, 'rut') ?? '').trim();
      if (rutClean(rutRaw).length < 2) { noRut++; continue; }
      const p = {
        id: 'r_' + crypto.randomUUID(), deleted: false, fuente: S.importFile,
        residente: String(g(row, 'residente') ?? '').trim(),
        tipo: normTipo(g(row, 'tipo')), modalidades: normMods(g(row, 'modalidad')),
        fecha: toIso(g(row, 'fecha')), rut: rutValid(rutRaw) ? rutFormat(rutRaw) : rutRaw,
        especialidad: normEsp(g(row, 'especialidad')), diagnostico: String(g(row, 'diagnostico') ?? '').trim()
      };
      const k = dedupKey(p);
      if (existing.has(k)) { dup++; continue; }
      existing.add(k); list.push(p);
    }
  }
  busy(btn, true, 'Cifrando…');
  try { if (list.length) await saveMany('residentes', list); }
  catch (e) { toast('No se pudo importar: ' + e.message, true); return; }
  finally { busy(btn, false); }
  $('#impDlg').close(); S.importSheets = null; renderRes();
  toast(`${list.length} caso${list.length === 1 ? '' : 's'} importado${list.length === 1 ? '' : 's'}${dup ? `, ${dup} ya existían` : ''}${noRut ? `, ${noRut} filas sin RUT` : ''}`);
}

/* ---------------- Exportación (CSV para Excel) ---------------- */
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;               // evita inyección de fórmulas
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCSV(name, head, rows) {
  const text = '\uFEFF' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function exportCasos() {
  if (!confirm('El CSV quedará sin cifrar en este dispositivo. ¿Continuar?')) return;
  const arr = live(S.casos).sort(byFecha(1));
  downloadCSV(`casos_${todayIso()}.csv`,
    ['Fecha examen', 'RUT', 'Especialidad', 'Órgano', 'Subtema', 'Mes rotación', 'Tema del temario', 'Modalidad', 'Tipo', 'Diagnóstico', 'Notas', 'Mostrado', 'Fecha mostrado'],
    arr.map(x => { const e = eff(x); return [isoToDisp(x.fecha), x.rut, x.especialidad, e.organo, e.subtema, e.mes ? 'Mes ' + e.mes : '', e.tema ? e.tema.tema : '',
      (x.modalidades || []).join(' + '), x.tipo, x.diagnostico, x.notas, x.mostrado ? 'Sí' : 'No', isoToDisp(x.mostradoEn || '')]; }));
}
function exportRes() {
  if (!confirm('El CSV quedará sin cifrar en este dispositivo. ¿Continuar?')) return;
  const arr = live(S.res).sort(byFecha(1));
  downloadCSV(`casos_residentes_${todayIso()}.csv`,
    ['Residente', 'Entrega o FU', 'Modalidad', 'Fecha de estudio', 'RUT', 'Especialidad', 'Órgano', 'Subtema', 'Mes', 'Diagnóstico'],
    arr.map(x => { const e = eff(x); return [x.residente, x.tipo, (x.modalidades || []).join(' + '), isoToDisp(x.fecha), x.rut, x.especialidad, e.organo, e.subtema, e.mes ? 'Mes ' + e.mes : '', x.diagnostico]; }));
}
function exportTemario() {
  const arr = live(S.tem).sort(temSort);
  downloadCSV(`temario_${todayIso()}.csv`, ['Especialidad', 'Mes', 'Órgano', 'Subtema', 'Tema'],
    arr.map(t => { const c = temCls(t); return [t.especialidad, t.mes, c.organo, c.subtema, t.tema]; }));
}

/* ---------------- Práctica ---------------- */
function pracPool() {
  const src = S.fp.src, out = [];
  if (src !== 'res') for (const x of live(S.casos)) out.push({ col: 'casos', x });
  if (src !== 'mine') for (const x of live(S.res)) out.push({ col: 'residentes', x });
  return out;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function orderDeck(list, orden) {
  if (orden === 'azar') return shuffle(list.slice());
  if (orden === 'fecha') return list.slice().sort((a, b) => byFecha(-1)(a.x, b.x));
  // prioridad: nunca practicados, luego con más errores, luego los practicados hace más tiempo
  return shuffle(list.slice()).sort((a, b) => {
    const pa = a.x.practica, pb = b.x.practica;
    if (!pa !== !pb) return pa ? 1 : -1;
    if (!pa) return 0;
    return (pa.ok - pa.fail) - (pb.ok - pb.fail) || (pa.last || 0) - (pb.last || 0);
  });
}
function renderPracMode() {
  refreshChoice($('#p-mode'));
  const tem = S.fp.mode === 'temario';
  $('#p-tem').hidden = !tem;
  $('#p-setup').hidden = tem || !!S.prac;
  $('#p-session').hidden = tem || !S.prac;
}
function renderPrac() {
  renderPracMode();
  if (S.fp.mode === 'temario') return renderTem();
  if (S.prac) return renderSession();
  const f = S.fp, pool = pracPool();
  renderEspBar($('#p-esp'), f, pool.map(p => p.x), renderPrac);
  const colOf = new Map(pool.map(p => [p.x.id, p.col]));
  const { list } = facetFilter(pool.map(p => p.x), f, { org: '#p-org', sub: '#p-sub', mes: '#p-mes' });
  S.pracCands = list.map(x => ({ col: colOf.get(x.id), id: x.id, x }));
  const never = list.filter(x => !x.practica).length, weak = list.filter(x => x.practica && x.practica.fail > x.practica.ok).length;
  $('#p-count').textContent = list.length
    ? `${list.length} caso${list.length > 1 ? 's' : ''} con estos filtros: ${never} sin practicar${weak ? `, ${weak} con más errores que aciertos` : ''}.`
    : 'No hay casos con estos filtros.';
  const n = f.n === 'all' ? list.length : Math.min(list.length, Number(f.n));
  $('#p-start').disabled = !list.length;
  $('#p-start').textContent = list.length ? `Empezar práctica (${n} caso${n === 1 ? '' : 's'})` : 'Empezar práctica';
}
function startPractice(items) {
  if (!items.length) return;
  S.prac = { deck: items.map(({ col, id }) => ({ col, id })), i: 0, revealed: false, ok: 0, fail: 0, failed: [], active: true };
  renderPrac(); window.scrollTo(0, 0);
}
function startFromFilters() {
  const f = S.fp;
  const deck = orderDeck(S.pracCands || [], f.orden);
  startPractice(f.n === 'all' ? deck : deck.slice(0, Number(f.n)));
}
function renderSession() {
  renderPracMode();
  const P = S.prac, box = $('#p-session');
  if (!P.active) return renderSummary();
  let it = P.deck[P.i], x = it && mapOf(it.col).get(it.id);
  while (it && (!x || x.deleted)) { P.i++; it = P.deck[P.i]; x = it && mapOf(it.col).get(it.id); }
  if (!it) { P.active = false; return renderSummary(); }
  const e = eff(x), hide = S.fp.hide;
  const rows = [
    ['Fecha', isoToDisp(x.fecha)],
    ['RUT', h('span', { class: 'rutline' }, x.rut, ' ', h('button', { type: 'button', class: 'link sm', onclick: () => copyText(x.rut, 'RUT') }, 'Copiar'))],
    ['Modalidad', (x.modalidades || []).join(' + ')], ['Tipo', x.tipo], ['Especialidad', x.especialidad],
    ['Órgano', hide && !P.revealed ? '' : e.organo], ['Subtema', hide && !P.revealed ? '' : e.subtema],
    ['Residente', it.col === 'residentes' ? x.residente : '']
  ].filter(r => r[1]);
  box.replaceChildren(h('div', { class: 'pcard', style: { '--esp': espColor(x.especialidad) } },
    h('div', { class: 'pprog' }, h('span', {}, `Caso ${P.i + 1} de ${P.deck.length}`), h('span', { class: 'pscore' }, `${P.ok} bien, ${P.fail} por repasar`)),
    h('div', { class: 'pbar' }, h('span', { style: { width: `${Math.round(100 * P.i / P.deck.length)}%` } })),
    h('dl', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
    P.revealed
      ? h('div', { class: 'answer' },
        h('div', { class: 'lbl' }, 'Diagnóstico'),
        h('p', { class: 'ans-dx' }, x.diagnostico || 'Sin diagnóstico registrado'),
        x.notas ? h('p', { class: 'muted' }, x.notas) : null,
        e.tema ? h('p', { class: 'muted' }, `Temario${e.mes ? ', mes ' + e.mes : ''}: ${e.tema.tema}`) : null)
      : h('p', { class: 'muted phint' }, 'Abre el estudio en el PACS, interprétalo y luego revisa la respuesta.'),
    h('div', { class: 'pactions' },
      P.revealed
        ? [h('button', { type: 'button', class: 'btn', onclick: () => answer(false) }, 'No lo tenía'),
          h('button', { type: 'button', class: 'btn primary', onclick: () => answer(true) }, 'Lo tenía')]
        : h('button', { type: 'button', class: 'btn primary', onclick: () => { P.revealed = true; renderSession(); } }, 'Mostrar respuesta')),
    h('div', { class: 'psec' },
      h('button', { type: 'button', class: 'link sm', onclick: () => { P.i++; P.revealed = false; renderSession(); } }, 'Saltar'),
      h('button', { type: 'button', class: 'link sm', onclick: () => { P.active = false; renderSession(); } }, 'Terminar'))));
}
async function answer(ok) {
  const P = S.prac, it = P.deck[P.i], x = mapOf(it.col).get(it.id);
  const pr = { ok: 0, fail: 0, ...(x.practica || {}) };
  if (ok) pr.ok++; else pr.fail++;
  pr.last = Date.now();
  await saveRecord(it.col, { ...x, practica: pr });
  if (ok) P.ok++; else { P.fail++; P.failed.push(it); }
  P.i++; P.revealed = false;
  if (P.i >= P.deck.length) P.active = false;
  renderSession();
}
function renderSummary() {
  const P = S.prac, done = P.ok + P.fail, box = $('#p-session');
  renderPracMode();
  box.replaceChildren(h('div', { class: 'pcard' },
    h('h2', {}, 'Práctica terminada'),
    h('p', { class: 'pbig' }, done ? `${P.ok} de ${done} (${Math.round(100 * P.ok / done)} %)` : 'No respondiste casos.'),
    P.failed.length ? h('div', {}, h('div', { class: 'lbl' }, 'Para repasar'),
      h('ul', { class: 'plain' }, ...P.failed.map(it => { const x = mapOf(it.col).get(it.id); return x ? h('li', {}, `${isoToDisp(x.fecha)}, ${x.rut}: ${x.diagnostico || 'sin diagnóstico'}`) : null; }))) : null,
    h('div', { class: 'pactions' },
      P.failed.length ? h('button', { type: 'button', class: 'btn', onclick: () => startPractice(P.failed) }, 'Repetir los que fallé') : null,
      h('button', { type: 'button', class: 'btn primary', onclick: () => { S.prac = null; renderPrac(); } }, 'Nueva práctica'))));
}

/* ---------------- Temario ---------------- */
const temCls = t => (t.organo && t.subtema ? t : { ...classifyText(t.especialidad, t.tema), ...(t.organo ? { organo: t.organo } : {}), ...(t.subtema ? { subtema: t.subtema } : {}) });
const temSort = (a, b) => ESPECIALIDADES.indexOf(a.especialidad) - ESPECIALIDADES.indexOf(b.especialidad)
  || (Number(a.mes) || 99) - (Number(b.mes) || 99) || (a.orden ?? 0) - (b.orden ?? 0) || a.tema.localeCompare(b.tema, 'es');
let _cov = null;
function coverage() {
  const key = `${TEM_V}|${S.casos.size}|${S.res.size}|${[...S.casos.values(), ...S.res.values()].reduce((m, x) => Math.max(m, x.updatedAt || 0), 0)}`;
  if (_cov && _cov.key === key) return _cov.m;
  const m = new Map();
  for (const [col, map] of [['casos', S.casos], ['residentes', S.res]]) for (const x of map.values()) {
    if (x.deleted) continue;
    const e = eff(x);
    if (e.tema) { if (!m.has(e.tema.id)) m.set(e.tema.id, []); m.get(e.tema.id).push({ col, id: x.id, x }); }
  }
  _cov = { key, m };
  return m;
}
function renderTem() {
  const f = S.ft, all = live(S.tem);
  renderEspBar($('#t-esp'), f, all, renderTem);
  const cov = coverage();
  const inEsp = all.filter(t => f.esp === '' || t.especialidad === f.esp);
  f.mes = fillSelect($('#t-mes'), 'Meses', mesVals(inEsp.map(t => t.mes)), f.mes, v => 'Mes ' + v, inEsp.some(t => !t.mes) ? [['_', 'Sin mes']] : []);
  const n = t => (cov.get(t.id) || []).length;
  const arr = inEsp.filter(t => (!f.mes || (f.mes === '_' ? !t.mes : String(t.mes) === f.mes)) && (f.cov === '' || (f.cov === 'con') === (n(t) > 0))).sort(temSort);
  const withC = inEsp.filter(t => n(t) > 0).length;
  $('#t-count').textContent = inEsp.length ? `${inEsp.length} tema${inEsp.length > 1 ? 's' : ''}, ${withC} con casos (${Math.round(100 * withC / inEsp.length)} %)` : '';
  $('#t-clear').hidden = !f.esp || !inEsp.length;
  $('#t-assign').hidden = !all.length; $('#t-export').hidden = !all.length;
  const box = $('#t-list');
  if (!arr.length) {
    box.replaceChildren(h('p', { class: 'empty-state' }, inEsp.length ? 'Ningún tema coincide con estos filtros.'
      : 'Importa el temario (PDF, Word, PowerPoint, Excel o texto). Los temas se ordenan por mes y verás cuáles ya tienen casos y cuáles faltan.'));
    return;
  }
  const groups = new Map();
  for (const t of arr) { const k = `${t.especialidad}|${t.mes || ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  box.replaceChildren(...[...groups.entries()].map(([k, ts]) => {
    const [esp, mes] = k.split('|'), c = ts.filter(t => n(t) > 0).length;
    return h('section', { class: 'grp' },
      h('h3', {}, (f.esp ? '' : esp + ', ') + (mes ? 'Mes ' + mes : 'Sin mes'), h('span', { class: 'cnt' }, ` ${c} de ${ts.length} con casos`)),
      h('ol', { class: 'list' }, ...ts.map(t => {
        const cc = temCls(t), k2 = n(t);
        return h('li', { class: 'row trow', style: { '--esp': espColor(t.especialidad) } },
          h('button', { type: 'button', class: 'rbody', onclick: () => openTopic(t.id) },
            h('div', { class: 'dx' }, t.tema),
            h('div', { class: 'meta' }, [cc.organo, cc.subtema].filter(Boolean).join(', ') || 'Sin clasificar',
              ' ', h('span', { class: 'badge ' + (k2 ? 'ok' : 'warn') }, k2 ? `${k2} caso${k2 > 1 ? 's' : ''}` : 'Sin casos'))));
      })));
  }));
}
function mesOptions(cur) {
  const vals = [...new Set(['1', '2', '3', '4', '5', '6', String(cur || '')].filter(Boolean))].sort((a, b) => a - b);
  return [h('option', { value: '' }, 'Sin mes'), ...vals.map(v => h('option', { value: v }, 'Mes ' + v))];
}
function openTopic(id) {
  const isNew = !id;
  const t = isNew ? { id: 't_' + crypto.randomUUID(), especialidad: S.ft.esp || ESPECIALIDADES[0], mes: '', tema: '', organo: '', subtema: '', deleted: false } : { ...S.tem.get(id) };
  const d = $('#detail');
  const espSel = h('select', { 'aria-label': 'Especialidad' }, ...ESPECIALIDADES.map(e => h('option', { value: e }, e)));
  espSel.value = t.especialidad;
  const temaEl = h('textarea', { rows: '3', 'aria-label': 'Tema' }); temaEl.value = t.tema;
  const mesSel = h('select', { 'aria-label': 'Mes' }, ...mesOptions(t.mes)); mesSel.value = String(t.mes || '');
  const orgSel = h('select', { 'aria-label': 'Órgano' }), subSel = h('select', { 'aria-label': 'Subtema' });
  const fillOS = () => {
    const esp = espSel.value, auto = classifyText(esp, temaEl.value);
    orgSel.replaceChildren(h('option', { value: '' }, `Automático${auto.organo ? ': ' + auto.organo : ''}`), ...organosDe(esp).map(o => h('option', { value: o }, o)));
    subSel.replaceChildren(h('option', { value: '' }, `Automático${auto.subtema ? ': ' + auto.subtema : ''}`), ...subtemasDe(esp).map(o => h('option', { value: o }, o)));
    orgSel.value = organosDe(esp).includes(t.organo) ? t.organo : ''; subSel.value = subtemasDe(esp).includes(t.subtema) ? t.subtema : '';
  };
  fillOS();
  espSel.addEventListener('change', () => { t.organo = ''; t.subtema = ''; fillOS(); });
  temaEl.addEventListener('input', debounce(fillOS, 300));
  const rel = isNew ? [] : (coverage().get(id) || []);
  d.replaceChildren(h('div', { class: 'dlg' },
    h('h2', {}, isNew ? 'Nuevo tema' : 'Tema del temario'),
    h('div', { class: 'formgrid' },
      h('label', { class: 'lbl' }, 'Tema'), temaEl,
      isNew ? [h('label', { class: 'lbl' }, 'Especialidad'), espSel] : null,
      h('label', { class: 'lbl' }, 'Mes'), mesSel,
      h('label', { class: 'lbl' }, 'Órgano'), orgSel,
      h('label', { class: 'lbl' }, 'Subtema'), subSel),
    !isNew ? h('div', { class: 'rel' },
      h('div', { class: 'lbl' }, rel.length ? `Casos relacionados (${rel.length})` : 'Aún no hay casos para este tema'),
      rel.length ? h('ul', { class: 'plain' }, ...rel.slice(0, 30).map(r => h('li', {}, `${isoToDisp(r.x.fecha)}, ${r.x.diagnostico || 'sin diagnóstico'}${r.col === 'residentes' ? ` (${r.x.residente || 'residente'})` : ''}`))) : null) : null,
    h('div', { class: 'dlg-actions' },
      rel.length ? h('button', { type: 'button', class: 'btn', onclick: () => { d.close(); S.fp.mode = 'casos'; startPractice(rel); } }, 'Practicar estos casos') : null,
      !isNew ? h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!confirm('¿Eliminar este tema?')) return;
        await saveRecord('temario', { id, deleted: true }); d.close(); renderTem();
      } }, 'Eliminar') : null,
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => {
        const tema = temaEl.value.replace(/\s+/g, ' ').trim();
        if (!tema) { toast('Escribe el tema', true); return; }
        await saveRecord('temario', { ...t, especialidad: espSel.value, tema, mes: mesSel.value, organo: orgSel.value, subtema: subSel.value, orden: t.orden ?? Date.now() });
        d.close(); renderTem(); toast('Tema guardado');
      } }, 'Guardar'))));
  d.showModal();
}

async function onTemarioFile(file) {
  try {
    toast('Leyendo el temario…');
    const r = await extractTemario(file);
    const parsed = r.items
      ? { items: r.items, monthsFound: r.items.some(i => i.mes), espsFound: [...new Set(r.items.map(i => i.esp).filter(Boolean))] }
      : parseTemarioLines(r.lines);
    if (!parsed.items.length) throw new Error('No encontré temas en el archivo');
    openTemPreview(parsed, file.name);
  } catch (e) { toast(e.message, true); }
  finally { $('#t-file').value = ''; }
}
function openPaste() {
  const d = $('#impDlg');
  const ta = h('textarea', { rows: '12', placeholder: 'Mes 1\nAnatomía hepática segmentaria\nLesiones hepáticas benignas\n\nMes 2\n…', 'aria-label': 'Texto del temario' });
  d.replaceChildren(h('div', { class: 'dlg' },
    h('h2', {}, 'Pegar temario'),
    h('p', { class: 'muted' }, 'Pega el texto tal como está. Los encabezados «Mes 1», «Segundo mes», «Semana 5» o el nombre de un mes del calendario definen el mes de los temas que siguen.'),
    ta,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => {
        const parsed = parseTemarioLines(ta.value.split(/\r?\n/));
        if (!parsed.items.length) { toast('No encontré temas en el texto', true); return; }
        openTemPreview(parsed, 'Texto pegado');
      } }, 'Revisar'))));
  d.showModal(); setTimeout(() => ta.focus(), 50);
}
function openTemPreview(parsed, fuente) {
  const def = S.ft.esp || S.fp.esp || S.form.esp || '';
  S.temPreview = { parsed, fuente, espMode: parsed.espsFound.length ? 'auto' : def, espFallback: def, dist: 'none', nMeses: '4', replace: true,
    keep: parsed.items.map(i => !(parsed.monthsFound && !i.mes)) };   // si hay meses, lo que queda fuera de ellos (títulos, portada) parte desmarcado
  renderTemPreview();
  if (!$('#impDlg').open) $('#impDlg').showModal();
}
function previewItems() {
  const P = S.temPreview, items = P.parsed.items;
  const kept = items.map((it, i) => ({ ...it, i })).filter(it => P.keep[it.i]);
  const out = kept.map(it => ({ ...it, esp: P.espMode === 'auto' ? (it.esp || P.espFallback) : P.espMode }));
  if (!P.parsed.monthsFound && P.dist === 'split') {
    const N = Number(P.nMeses), byEsp = {};
    for (const it of out) (byEsp[it.esp] = byEsp[it.esp] || []).push(it);
    for (const arr of Object.values(byEsp)) arr.forEach((it, k) => { it.mes = String(Math.floor(k * N / arr.length) + 1); });
  }
  return out;
}
function renderTemPreview() {
  const P = S.temPreview, d = $('#impDlg'), items = P.parsed.items;
  const months = new Set(items.map(i => i.mes).filter(Boolean));
  const espSel = h('select', { 'aria-label': 'Especialidad del temario' },
    P.parsed.espsFound.length ? h('option', { value: 'auto' }, `Detectada en el archivo (${P.parsed.espsFound.join(', ')})`) : h('option', { value: '' }, 'Elige la especialidad…'),
    ...ESPECIALIDADES.map(e => h('option', { value: e }, e)));
  espSel.value = P.espMode;
  espSel.addEventListener('change', () => { P.espMode = espSel.value; renderTemPreview(); });
  const needFallback = P.espMode === 'auto' && items.some(i => !i.esp);
  const fbSel = h('select', { 'aria-label': 'Especialidad para temas sin especialidad' }, h('option', { value: '' }, 'Elige…'), ...ESPECIALIDADES.map(e => h('option', { value: e }, e)));
  fbSel.value = P.espFallback;
  fbSel.addEventListener('change', () => { P.espFallback = fbSel.value; renderTemPreview(); });
  const distBox = P.parsed.monthsFound ? null : (() => {
    const r1 = h('input', { type: 'radio', name: 'dist' }), r2 = h('input', { type: 'radio', name: 'dist' });
    r1.checked = P.dist === 'none'; r2.checked = P.dist === 'split';
    r1.addEventListener('change', () => { P.dist = 'none'; renderTemPreview(); });
    r2.addEventListener('change', () => { P.dist = 'split'; renderTemPreview(); });
    const nSel = h('select', { 'aria-label': 'Número de meses', class: 'inline' }, ...['2', '3', '4', '5', '6'].map(v => h('option', { value: v }, v)));
    nSel.value = P.nMeses; nSel.addEventListener('change', () => { P.nMeses = nSel.value; renderTemPreview(); });
    return h('fieldset', { class: 'radios' }, h('legend', {}, 'No encontré encabezados de mes'),
      h('label', { class: 'check' }, r1, ' Dejar los temas sin mes'),
      h('label', { class: 'check' }, r2, ' Repartirlos en orden entre ', nSel, ' meses'));
  })();
  const out = previewItems();
  const targets = [...new Set(out.map(i => i.esp).filter(Boolean))];
  const existing = live(S.tem).filter(t => targets.includes(t.especialidad)).length;
  const rep = h('input', { type: 'checkbox' }); rep.checked = P.replace;
  rep.addEventListener('change', () => { P.replace = rep.checked; });
  const groups = new Map();
  items.forEach((it, i) => {
    const o = out.find(x => x.i === i);
    const key = o ? `${o.esp}|${o.mes || ''}` : `${it.esp}|${it.mes || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ it, i, o });
  });
  const list = [...groups.entries()].map(([k, arr]) => {
    const [esp, mes] = k.split('|');
    return h('div', { class: 'pvgrp' }, h('h3', {}, `${esp || 'Sin especialidad'}, ${mes ? 'mes ' + mes : 'sin mes'}`, h('span', { class: 'cnt' }, ` ${arr.length}`)),
      ...arr.map(({ it, i }) => {
        const cb = h('input', { type: 'checkbox' }); cb.checked = P.keep[i];
        cb.addEventListener('change', () => { P.keep[i] = cb.checked; $('#tp-save').textContent = `Guardar ${P.keep.filter(Boolean).length} temas`; });
        const c = classifyText(esp || P.espFallback, it.tema);
        return h('label', { class: 'pvitem' }, cb, h('span', {}, it.tema, (c.organo || c.subtema) ? h('span', { class: 'meta' }, ` ${[c.organo, c.subtema].filter(Boolean).join(', ')}`) : null));
      }));
  });
  d.replaceChildren(h('div', { class: 'dlg' },
    h('h2', {}, 'Revisar temario'),
    h('p', { class: 'muted' }, `${P.fuente}: ${items.length} temas${months.size ? ` en ${months.size} mes${months.size > 1 ? 'es' : ''}` : ''}. Desmarca lo que no sea un tema (títulos, horarios, nombres).`),
    h('div', { class: 'formgrid' },
      h('label', { class: 'lbl' }, 'Especialidad'), espSel,
      needFallback ? [h('label', { class: 'lbl' }, 'Temas sin especialidad detectada'), fbSel] : null),
    distBox,
    existing ? h('label', { class: 'check' }, rep, ` Reemplazar el temario que ya tienes de ${targets.join(', ')} (${existing} temas)`) : null,
    h('div', { class: 'pvlist' }, ...list),
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', id: 'tp-save', onclick: e => saveTemPreview(e.currentTarget) }, `Guardar ${P.keep.filter(Boolean).length} temas`))));
}
async function saveTemPreview(btn) {
  const P = S.temPreview, out = previewItems();
  if (!out.length) { toast('No hay temas marcados', true); return; }
  if (out.some(i => !ESPECIALIDADES.includes(i.esp))) { toast('Elige la especialidad del temario', true); return; }
  const targets = [...new Set(out.map(i => i.esp))];
  busy(btn, true, 'Guardando…');
  try {
    if (P.replace) {
      const old = live(S.tem).filter(t => targets.includes(t.especialidad)).map(t => ({ id: t.id, deleted: true }));
      if (old.length) await saveMany('temario', old);
    }
    const base = Date.now();
    await saveMany('temario', out.map((it, k) => ({
      id: 't_' + crypto.randomUUID(), especialidad: it.esp, mes: String(it.mes || ''), tema: it.tema,
      organo: organosDe(it.esp).includes(it.organo) ? it.organo : '', subtema: subtemasDe(it.esp).includes(it.subtema) ? it.subtema : '',
      orden: base + k, fuente: P.fuente, deleted: false
    })));
  } catch (e) { toast('No se pudo guardar: ' + e.message, true); return; }
  finally { busy(btn, false); }
  $('#impDlg').close(); S.temPreview = null;
  S.ft.esp = targets.length === 1 ? targets[0] : ''; S.fp.mode = 'temario';
  renderPrac(); renderCasos(); renderRes();
  toast(`${out.length} temas guardados`);
}
async function assignMonths() {
  const cand = live(S.casos).filter(x => !x.mes).map(x => [x, eff(x)]).filter(([, e]) => e.mesAuto);
  if (!cand.length) { toast('No hay casos sin mes que calcen con el temario'); return; }
  if (!confirm(`¿Guardar el mes sugerido por el temario en ${cand.length} caso${cand.length > 1 ? 's' : ''} que no tienen mes?`)) return;
  await saveMany('casos', cand.map(([x, e]) => ({ ...x, mes: e.mes })));
  renderLists(); toast('Meses asignados');
}
async function clearTemario() {
  const esp = S.ft.esp, arr = live(S.tem).filter(t => t.especialidad === esp);
  if (!arr.length || !confirm(`¿Borrar los ${arr.length} temas de ${esp}? Se borrarán en todos tus dispositivos.`)) return;
  await saveMany('temario', arr.map(t => ({ id: t.id, deleted: true })));
  renderLists(); toast('Temario borrado');
}

/* ---------------- Ajustes ---------------- */
function renderCfg() {
  $('#cfg-url').value = S.cfg.endpoint || '';
  $('#cfg-token').value = S.cfg.token || '';
  $('#cfg-remember').checked = S.remember;
  $('#cfg-lock').value = String(S.cfg.lockMin);
  const n = S.dirty.size;
  $('#cfg-status').textContent = !S.cfg.endpoint ? 'Sin conexión configurada: los casos solo existen en este dispositivo.'
    : `Última sincronización: ${S.cfg.lastSync ? fmtDT(S.cfg.lastSync) : 'nunca'}. ${n ? `${n} cambio${n > 1 ? 's' : ''} pendiente${n > 1 ? 's' : ''}.` : 'Sin cambios pendientes.'}${S.syncErr ? ' Último error: ' + S.syncErr : ''}`;
  $('#cfg-counts').textContent = `${live(S.casos).length} casos propios, ${live(S.res).length} casos de residentes y ${live(S.tem).length} temas en este dispositivo.${S.bad ? ` ${S.bad} registro(s) ilegibles ignorados.` : ''}`;
}
async function connectFromCfg(btn) {
  const url = $('#cfg-url').value.trim(), tok = $('#cfg-token').value.trim();
  if (!url) {
    if (!confirm('¿Dejar de sincronizar este dispositivo? Los casos quedarán solo aquí.')) return;
    S.cfg.endpoint = ''; S.cfg.token = ''; await saveCfg(); updateSyncPill(); renderCfg(); return;
  }
  if (!URL_RE.test(url)) return toast('La URL debe ser de script.google.com y terminar en /exec', true);
  if (!tok) return toast('Falta el token', true);
  const prev = { ...S.cfg };
  S.cfg.endpoint = url; S.cfg.token = tok;
  busy(btn, true, 'Conectando…');
  try {
    const j = await api('getMeta');
    const rm = j.meta && j.meta.crypto ? JSON.parse(j.meta.crypto) : null;
    if (!rm) await api('setMeta', { meta: { crypto: JSON.stringify(S.meta) } });
    else if (rm.salt !== S.meta.salt || rm.verCt !== S.meta.verCt)
      throw new Error('Ese Sheet está cifrado con otra frase. Usa un Sheet nuevo, o borra los datos de este dispositivo y únete con la frase de ese Sheet.');
    if (prev.endpoint !== url) S.cfg.cursor = 0;
    await saveCfg(); toast('Conexión guardada'); sync();
  } catch (e) { S.cfg = prev; toast(e.message, true); }
  finally { busy(btn, false); renderCfg(); updateSyncPill(); }
}
async function wipeDevice() {
  const n = S.dirty.size;
  if (!confirm(n ? `Hay ${n} cambio(s) sin sincronizar que se perderán. ¿Borrar igual?` : '¿Borrar todos los datos de este dispositivo?')) return;
  DB.db.close();
  await new Promise(r => { const q = indexedDB.deleteDatabase('casos-rad'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
  location.reload();
}

/* ---------------- Navegación ---------------- */
const TAB_TITLES = { nuevo: 'Nuevo caso', casos: 'Mis casos', prac: 'Práctica', res: 'Residentes', cfg: 'Ajustes' };
function showTab(t) {
  S.tab = t;
  for (const k of Object.keys(TAB_TITLES)) {
    $('#view-' + k).hidden = k !== t;
    const b = $(`.tabbar [data-tab="${k}"]`);
    if (k === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#title').textContent = t === 'nuevo' && S.editingId ? 'Editar caso' : TAB_TITLES[t];
  if (t === 'cfg') renderCfg();
  if (t === 'prac') renderPrac();
  window.scrollTo(0, 0);
}
function renderLists() { renderCasos(); renderRes(); if (S.tab === 'prac') renderPrac(); }

/* ---------------- Eventos ---------------- */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function bindEvents() {
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#syncBtn').addEventListener('click', () => { if (S.cfg.endpoint) sync(); else showTab('cfg'); });
  $('#lockBtn').addEventListener('click', async () => { await setRemember(false); lock(); });

  // Mis casos
  fillSelect($('#c-tipo'), 'Tipos', TIPOS, '');
  $('#c-q').addEventListener('input', debounce(e => { S.fc.q = e.target.value; renderCasos(); }, 120));
  for (const [id, k] of [['#c-estado', 'estado'], ['#c-tipo', 'tipo'], ['#c-org', 'organo'], ['#c-sub', 'subtema'], ['#c-mes', 'mes']])
    $(id).addEventListener('change', e => { S.fc[k] = e.target.value; renderCasos(); });
  $('#c-orden').addEventListener('click', () => { S.fc.dir *= -1; renderCasos(); });

  // Residentes
  $('#r-q').addEventListener('input', debounce(e => { S.fr.q = e.target.value; renderRes(); }, 120));
  for (const [id, k] of [['#r-resid', 'residente'], ['#r-org', 'organo'], ['#r-sub', 'subtema'], ['#r-mes', 'mes']])
    $(id).addEventListener('change', e => { S.fr[k] = e.target.value; renderRes(); });
  $('#r-orden').addEventListener('click', () => { S.fr.dir *= -1; renderRes(); });
  $('#r-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) onImportFile(f); });
  $('#r-clear').addEventListener('click', async () => {
    const all = live(S.res); if (!all.length) return;
    if (!confirm(`¿Eliminar los ${all.length} casos de residentes? Se eliminarán en todos tus dispositivos.`)) return;
    await saveMany('residentes', all.map(x => ({ id: x.id, deleted: true })));
    renderRes(); toast('Lista vaciada');
  });

  // Práctica
  buildChoice($('#p-mode'), [{ value: 'casos', label: 'Practicar casos' }, { value: 'temario', label: 'Temario' }], () => S.fp.mode, v => { S.fp.mode = v; renderPrac(); }, { seg: true });
  for (const [id, k] of [['#p-org', 'organo'], ['#p-sub', 'subtema'], ['#p-mes', 'mes'], ['#p-src', 'src'], ['#p-orden', 'orden'], ['#p-n', 'n']])
    $(id).addEventListener('change', e => { S.fp[k] = e.target.value; renderPrac(); });
  $('#p-hide').addEventListener('change', e => { S.fp.hide = e.target.checked; });
  $('#p-start').addEventListener('click', startFromFilters);
  $('#t-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) onTemarioFile(f); });
  $('#t-paste').addEventListener('click', openPaste);
  $('#t-add').addEventListener('click', () => openTopic(null));
  $('#t-mes').addEventListener('change', e => { S.ft.mes = e.target.value; renderTem(); });
  $('#t-cov').addEventListener('change', e => { S.ft.cov = e.target.value; renderTem(); });
  $('#t-assign').addEventListener('click', assignMonths);
  $('#t-clear').addEventListener('click', clearTemario);
  $('#t-export').addEventListener('click', exportTemario);

  // Ajustes
  $('#cfg-save').addEventListener('click', e => connectFromCfg(e.currentTarget));
  $('#cfg-sync').addEventListener('click', () => sync());
  $('#cfg-remember').addEventListener('change', e => setRemember(e.target.checked));
  $('#cfg-lock').addEventListener('change', async e => { S.cfg.lockMin = Number(e.target.value); await saveCfg(); });
  $('#cfg-lockNow').addEventListener('click', async () => { await setRemember(false); lock(); });
  $('#cfg-exp-c').addEventListener('click', exportCasos);
  $('#cfg-exp-r').addEventListener('click', exportRes);
  $('#cfg-wipe').addEventListener('click', wipeDevice);
  // Acceso
  $('#g-connect').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#g-err-connect'), url = $('#g-url').value.trim(), tok = $('#g-token').value.trim();
    err.textContent = '';
    if (!URL_RE.test(url)) { err.textContent = 'La URL debe ser de script.google.com y terminar en /exec.'; return; }
    if (!tok) { err.textContent = 'Falta el token.'; return; }
    const btn = e.submitter || $('#g-connect .primary'); busy(btn, true, 'Conectando…');
    S.cfg.endpoint = url; S.cfg.token = tok;
    try {
      const j = await api('getMeta');
      const m = j.meta && j.meta.crypto ? JSON.parse(j.meta.crypto) : null;
      await saveCfg();
      if (m) { S.joinMeta = m; showGate('unlock', 'Este Sheet ya tiene casos. Ingresa la misma frase que usas en tus otros dispositivos.'); }
      else showGate('create');
    } catch (x) { S.cfg.endpoint = ''; S.cfg.token = ''; err.textContent = 'No se pudo conectar: ' + x.message; }
    finally { busy(btn, false); }
  });
  $('#g-local').addEventListener('click', () => { S.cfg.endpoint = ''; S.cfg.token = ''; showGate('create'); });
  $('#g-back').addEventListener('click', () => { S.joinMeta = null; showGate('connect'); });

  $('#g-create').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#g-err-create'), p1 = $('#g-p1').value, p2 = $('#g-p2').value;
    err.textContent = '';
    if (p1.length < 12) { err.textContent = 'Usa al menos 12 caracteres; idealmente 4 o más palabras.'; return; }
    if (p1 !== p2) { err.textContent = 'Las frases no coinciden.'; return; }
    const btn = e.submitter || $('#g-create .primary'); busy(btn, true, 'Creando clave…');
    try {
      const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
      const key = await deriveKey(p1, salt, KDF_ITER);
      const v = await encryptJSON(key, { check: VERIF }, 'verifier');
      const meta = { v: 1, kdf: 'PBKDF2-SHA256', iter: KDF_ITER, salt, verIv: v.iv, verCt: v.ct };
      if (S.cfg.endpoint) await api('setMeta', { meta: { crypto: JSON.stringify(meta) } });
      await DB.put('meta', meta, 'crypto'); await saveCfg();
      S.meta = meta; S.key = key;
      await setRemember($('#g-rem1').checked);
      $('#g-p1').value = ''; $('#g-p2').value = '';
      await afterUnlock();
    } catch (x) { err.textContent = x.message; }
    finally { busy(btn, false); }
  });

  $('#g-unlock').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#g-err-unlock'), meta = S.joinMeta || S.meta;
    err.textContent = '';
    const btn = e.submitter || $('#g-unlock .primary'); busy(btn, true, 'Verificando…');
    try {
      const key = await deriveKey($('#g-p').value, meta.salt, meta.iter);
      if (!(await verifyKey(key, meta))) throw new Error('Frase incorrecta.');
      if (S.joinMeta) { await DB.put('meta', S.joinMeta, 'crypto'); S.meta = S.joinMeta; S.joinMeta = null; }
      S.key = key;
      await setRemember($('#g-rem2').checked);
      $('#g-p').value = '';
      await afterUnlock();
    } catch (x) { err.textContent = x.message; }
    finally { busy(btn, false); }
  });

  // Actividad, visibilidad y conexión
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, () => { S.lastAct = Date.now(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { document.body.classList.add('veil'); return; }
    document.body.classList.remove('veil');
    if (!S.key) return;
    if (!S.remember && Date.now() - S.lastAct > S.cfg.lockMin * 60000) lock(); else sync();
  });
  window.addEventListener('online', () => sync());
  window.addEventListener('offline', () => { S.syncState = 'offline'; updateSyncPill(); });
}

/* ---------------- Arranque ---------------- */
async function boot() {
  if (!window.isSecureContext || !crypto.subtle) {
    document.body.textContent = 'Esta app necesita abrirse desde HTTPS (o localhost) para poder cifrar los datos.';
    return;
  }
  await DB.open();
  S.cfg = { ...S.cfg, ...((await DB.get('meta', 'cfg')) || {}) };
  S.meta = await DB.get('meta', 'crypto');
  initForm(); bindEvents();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (!S.meta) { showGate('connect'); return; }
  const k = await DB.get('meta', 'key');
  if (k && await verifyKey(k, S.meta)) { S.key = k; S.remember = true; await afterUnlock(); }
  else { if (k) await DB.del('meta', 'key'); showGate('unlock'); }
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { boot().catch(e => { document.body.textContent = 'Error al iniciar: ' + e.message; }); });
