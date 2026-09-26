'use strict';
/* =====================================================================
   Temario: lectura de archivos, detección de meses y especialidad,
   y relación entre temas y casos.
   Depende de funciones globales de app.js (norm, unzip, readXlsx,
   parseCSV, live, S) y de taxonomia.js (classifyText).
   ===================================================================== */

/* ---------------- Extracción de texto por formato ---------------- */
let _pdfjs = null;
async function loadPdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    _pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
  }
  return _pdfjs;
}
async function pdfLines(buf) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, stopAtErrors: false, verbosity: 0 });
  const doc = await task.promise;
  const lines = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let cur = '', lastY = null, lastEnd = null;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const x = it.transform ? it.transform[4] : null, y = it.transform ? it.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && cur.trim()) { lines.push(cur); cur = ''; lastEnd = null; }
        if (cur && lastEnd !== null && x !== null && x - lastEnd > 1 && !/\s$/.test(cur) && !/^\s/.test(it.str)) cur += ' ';
        cur += it.str;
        if (it.hasEOL) { lines.push(cur); cur = ''; lastEnd = null; }
        else lastEnd = x !== null ? x + (it.width || 0) : null;
        if (y !== null) lastY = y;
      }
      if (cur.trim()) lines.push(cur);
      page.cleanup();
    }
  } finally { await task.destroy(); }
  if (!lines.some(l => l.trim())) throw new Error('El PDF no tiene texto seleccionable (parece escaneado). Usa «Pegar texto» o pídele a Claude en el chat que lo convierta a la plantilla CSV.');
  return lines;
}
const xmlDoc = t => new DOMParser().parseFromString(t, 'text/xml');
async function docxLines(buf) {
  const z = await unzip(buf); const t = await z.text('word/document.xml');
  if (!t) throw new Error('No encontré el texto del documento de Word');
  return [...xmlDoc(t).getElementsByTagName('w:p')].map(p =>
    [...p.getElementsByTagName('*')].map(e => (e.localName === 't' ? e.textContent : e.localName === 'tab' || e.localName === 'br' ? ' ' : '')).join(''));
}
async function pptxLines(buf) {
  const z = await unzip(buf);
  const slides = z.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const lines = [];
  for (const s of slides) for (const p of xmlDoc(await z.text(s)).getElementsByTagName('a:p'))
    lines.push([...p.getElementsByTagName('a:t')].map(e => e.textContent).join(''));
  return lines;
}
async function odtLines(buf) {
  const z = await unzip(buf); const t = await z.text('content.xml');
  if (!t) throw new Error('No encontré el texto del documento');
  return [...xmlDoc(t).getElementsByTagName('*')].filter(e => e.nodeName === 'text:p' || e.nodeName === 'text:h').map(e => e.textContent);
}
function htmlLines(text) {
  const d = new DOMParser().parseFromString(text, 'text/html');
  return [...d.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,dt,dd')].map(el => {
    const c = el.cloneNode(true); c.querySelectorAll('ul,ol').forEach(x => x.remove()); return c.textContent;
  });
}

/* Tablas (Excel/CSV): si hay una columna de tema se leen como filas estructuradas. */
const TCOL = {
  tema: ['tema', 'contenido', 'topico', 'materia', 'clase', 'titulo', 'patologia', 'unidad'],
  mes: ['mes', 'month'], semana: ['semana', 'week'],
  especialidad: ['especialidad', 'rotacion', 'seccion', 'area'],
  organo: ['organo', 'region', 'sistema'], subtema: ['subtema', 'categoria', 'subtopico']
};
function tableToItems(rows) {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const hd = (rows[i] || []).map(c => norm(c));
    const col = {};
    for (const [k, pats] of Object.entries(TCOL)) col[k] = hd.findIndex(h => h && pats.some(p => h === p || h.startsWith(p + ' ') || h.endsWith(' ' + p)));
    if (col.tema < 0 || (col.mes < 0 && col.semana < 0 && col.especialidad < 0)) continue;
    const items = [];
    for (const r of rows.slice(i + 1)) {
      const g = k => (col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '');
      const tema = g('tema'); if (!tema) continue;
      let mes = '';
      if (g('mes')) mes = numFrom(norm(g('mes')));
      else if (g('semana')) { const w = numFrom(norm(g('semana'))); if (w) mes = String(Math.ceil(Number(w) / 4)); }
      items.push({ tema, mes: mes || '', esp: g('especialidad') ? espFromHeader(norm(g('especialidad')), true) : '', organo: g('organo'), subtema: g('subtema') });
    }
    return items;
  }
  return null;
}

/** Devuelve { lines } o { items } según el formato. */
async function extractTemario(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf')) return { lines: await pdfLines(await file.arrayBuffer()) };
  if (n.endsWith('.docx')) return { lines: await docxLines(await file.arrayBuffer()) };
  if (n.endsWith('.pptx')) return { lines: await pptxLines(await file.arrayBuffer()) };
  if (n.endsWith('.odt')) return { lines: await odtLines(await file.arrayBuffer()) };
  if (/\.(html?|xhtml)$/.test(n)) return { lines: htmlLines(await file.text()) };
  if (/\.(xlsx|xlsm|csv|tsv)$/.test(n)) {
    const sheets = /\.xls[xm]$/.test(n) ? await readXlsx(await file.arrayBuffer()) : [{ name: '', rows: parseCSV(await file.text()) }];
    const items = [], lines = [];
    for (const s of sheets) {
      const it = tableToItems(s.rows);
      if (it) items.push(...it);
      else { if (sheets.length > 1) lines.push(s.name); for (const r of s.rows) lines.push((r || []).map(c => String(c ?? '').trim()).filter(Boolean).join(' — ')); }
    }
    return items.length ? { items } : { lines };
  }
  if (/\.(txt|md|markdown|text)$/.test(n) || file.type.startsWith('text/')) return { lines: (await file.text()).split(/\r?\n/) };
  if (/\.(doc|ppt|xls|pages|key|rtf)$/.test(n)) throw new Error('Ese formato antiguo no se puede leer aquí. Guárdalo como PDF, .docx o .xlsx, o pega el texto.');
  throw new Error('Formato no reconocido. Usa PDF, Word (.docx), PowerPoint (.pptx), Excel, CSV o texto.');
}

/* ---------------- Detección de meses y especialidad ---------------- */
const ORD = { uno: 1, primer: 1, primero: 1, primera: 1, dos: 2, segundo: 2, segunda: 2, tres: 3, tercer: 3, tercero: 3, tercera: 3,
  cuatro: 4, cuarto: 4, cuarta: 4, cinco: 5, quinto: 5, seis: 6, sexto: 6, i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
const CAL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
function numFrom(s) {
  const m = String(s).match(/\d{1,2}/); if (m) return String(Number(m[0]));
  for (const w of String(s).split(/[^a-z]+/)) if (ORD[w]) return String(ORD[w]);
  return '';
}
function monthHeader(n) {
  let m;
  if ((m = n.match(/^(?:mes|month)\s*(?:n[°ºo.]*\s*)?(\d{1,2}|iv|v?i{1,3}|uno|dos|tres|cuatro|cinco|seis)\b/))) return { mes: numFrom(m[1]), len: m[0].length };
  if ((m = n.match(/^(primer|primero|primera|segundo|segunda|tercer|tercero|tercera|cuarto|cuarta|quinto|sexto)\s+mes\b/))) return { mes: String(ORD[m[1]]), len: m[0].length };
  if ((m = n.match(/^semanas?\s*(\d{1,2})(?:\s*(?:a|al|-|–|y|hasta)\s*(\d{1,2}))?\b/))) return { mes: String(Math.ceil(Number(m[1]) / 4)), len: m[0].length };
  if ((m = n.match(new RegExp('^(' + CAL.join('|') + ')\\b')))) return { cal: m[1], len: m[0].length };
  return null;
}
const ESP_HEAD = [
  ['Neurorradiología', ['neurorradiologia', 'neuroradiologia', 'neuro', 'neuroimagenes']],
  ['Musculoesquelético', ['musculoesqueletico', 'musculo esqueletico', 'msk', 'osteoarticular', 'radiologia musculoesqueletica']],
  ['Pediatría', ['pediatria', 'radiologia pediatrica', 'imagenes pediatricas']],
  ['Imágenes mamarias', ['imagenes mamarias', 'mama', 'mamas', 'mamaria', 'radiologia mamaria']],
  ['Digestivo', ['digestivo', 'gastrointestinal', 'radiologia digestiva']],
  ['Intervencional', ['intervencional', 'radiologia intervencional', 'intervencionismo']],
  ['TC de cuerpo', ['tc de cuerpo', 'tc cuerpo', 'tomografia computada de cuerpo', 'body ct']],
  ['MR de cuerpo', ['mr de cuerpo', 'rm de cuerpo', 'resonancia de cuerpo', 'rm cuerpo', 'mr cuerpo', 'body mr', 'resonancia magnetica de cuerpo']],
  ['Ecografía Doppler', ['ecografia doppler', 'doppler', 'eco doppler']],
  ['Ecografía gris', ['ecografia gris', 'eco gris', 'ecografia general', 'ecografia']],
  ['Negato', ['negato', 'negatoscopio', 'radiologia simple', 'radiografia simple']]
];
function espFromHeader(n, loose = false) {
  const s = n.replace(/^(?:(?:temario|programa|rotacion|modulo|unidad|de|del|en|la)\b\s*:?\s*)+/, '').replace(/[:.\-–—]+$/, '').trim();
  for (const [esp, syn] of ESP_HEAD) if (syn.includes(s)) return esp;
  if (loose) { const e = typeof normEsp === 'function' ? normEsp(s) : ''; return ESPECIALIDADES.includes(e) ? e : ''; }
  return '';
}
const NOISE = /^(\d+|pagina \d+( de \d+)?|temario|programa|contenidos?|indice|objetivos?( generales| especificos)?|introduccion|presentacion|horario|evaluacion|docentes?)\s*:?$/;
const BIB = /^(bibliografia|referencias|lecturas? (recomendadas?|sugeridas?)|literatura)\s*:?$/;

/** Convierte líneas de texto en temas con mes y especialidad. */
function parseTemarioLines(lines, fallbackEsp = '') {
  let mes = '', esp = '', inBib = false;
  const calOrder = [], items = [], seen = new Set(), espsFound = new Set();
  let monthsFound = false;
  const push = (txt) => {
    const tema = txt.replace(/\s+/g, ' ').trim().slice(0, 240);
    if (tema.length < 3) return;
    const k = `${esp}|${mes}|${norm(tema)}`;
    if (seen.has(k)) return; seen.add(k);
    items.push({ tema, mes, esp });
  };
  for (const raw of lines) {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const clean = s.replace(/^(?:[-•●▪◦■□*·–—>#]+|\(?\d{1,3}(?:[.)]\d{0,3})*[.)]|[a-zA-Z][.)])\s+/, '').trim();
    const n = norm(clean);
    const mh = n.length <= 80 ? monthHeader(n) : null;
    if (mh) {
      if (mh.cal) { if (!calOrder.includes(mh.cal)) calOrder.push(mh.cal); mes = String(calOrder.indexOf(mh.cal) + 1); }
      else mes = mh.mes;
      monthsFound = true; inBib = false;
      const rest = clean.split(/\s*[:–—]\s*|\s+-\s+/).slice(1).join(': ').trim();
      if (rest.length > 3 && !monthHeader(norm(rest))) push(rest);
      continue;
    }
    if (n.length <= 60) { const e = espFromHeader(n); if (e) { esp = e; espsFound.add(e); inBib = false; continue; } }
    if (BIB.test(n)) { inBib = true; continue; }
    if (inBib || NOISE.test(n) || /^[\W_]+$/.test(n)) continue;
    push(clean);
  }
  for (const it of items) if (!it.esp) it.esp = fallbackEsp;
  return { items, monthsFound, espsFound: [...espsFound] };
}

/* ---------------- Relación tema ↔ caso ---------------- */
const STOP = new Set(('de la el los las del y en con por para sin una uno unos unas que se su sus al lo como mas menos o u a e entre sobre desde hasta ' +
  'segun tipo tipos otro otra otros otras caso casos paciente pacientes estudio estudios imagen imagenes hallazgo hallazgos evaluacion diagnostico ' +
  'diagnostica diferencial diferenciales enfermedad enfermedades patologia patologias lesion lesiones anatomia normal generalidades introduccion ' +
  'clase manejo aspectos principales conceptos basicos tecnica radiologia radiologico radiologica imagenologia rol utilidad mes semana tema temas ' +
  'parte partes vs versus the and of lesiones asociada asociadas asociado asociados completa completo parcial aguda agudo agudos agudas ' +
  'cronica cronico bilateral derecha derecho izquierda izquierdo signo signos control').split(' '));
function stems(text) {
  const out = new Set();
  for (const w of norm(text).split(/[^a-z0-9]+/)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w.length > 6 ? w.slice(0, 6) : w);
  }
  return out;
}
let TEM_V = 0, _ti = null;
function temIndex() {
  if (_ti && _ti.v === TEM_V) return _ti;
  const by = {};
  for (const t of live(S.tem)) (by[t.especialidad] = by[t.especialidad] || []).push(t);
  const idx = {};
  for (const [esp, arr] of Object.entries(by)) {
    const df = {};
    const items = arr.map(t => {
      const st = stems(t.tema);
      st.forEach(w => { df[w] = (df[w] || 0) + 1; });
      const c = (t.organo && t.subtema) ? t : classifyText(esp, t.tema);
      return { t, st, organo: t.organo || c.organo, subtema: t.subtema || c.subtema };
    });
    const N = arr.length;
    idx[esp] = { items, idf: w => Math.log(1 + N / (df[w] || 1)) };
  }
  return (_ti = { v: TEM_V, idx });
}
/** Tema del temario que mejor calza con un texto dentro de una especialidad (o null). */
function matchTema(esp, text, organo, subtema) {
  const I = temIndex().idx[esp]; if (!I) return null;
  const st = stems(text); if (!st.size && !organo && !subtema) return null;
  let best = null, bs = 0;
  for (const it of I.items) {
    let s = 0;
    for (const w of st) if (it.st.has(w)) s += I.idf(w);
    if (organo && it.organo) s += it.organo === organo ? 1 : -1.5;   // misma región suma; región distinta resta
    if (subtema && it.subtema === subtema) s += 1.5;  // mismo tipo de patología
    if (s < 2) continue;
    if (s > bs) { bs = s; best = it; }
  }
  return bs >= 2 ? { tema: best.t, score: bs } : null;
}
