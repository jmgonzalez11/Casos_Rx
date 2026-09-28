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
  organo: ['organo', 'region', 'sistema'], subtema: ['subtema', 'categoria', 'subtopico'],
  detalle: ['detalle', 'objetivo', 'objetivos', 'descripcion', 'notas'], fuente: ['fuente', 'origen', 'documento']
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
      items.push({ tema, mes: mes || '', esp: g('especialidad') ? (espFromHeader(norm(g('especialidad')), true) || espInText(norm(g('especialidad')))) : '',
        organo: g('organo'), subtema: g('subtema'), detalle: g('detalle'), fuente: g('fuente') });
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
      if (/plantilla|template|ejemplo|instrucciones|resumen|fuentes/i.test(s.name || '') && sheets.length > 1) continue;   // hojas de apoyo
      const it = tableToItems(s.rows);
      if (it) items.push(...it);
      else { if (sheets.length > 1) lines.push(s.name); for (const r of s.rows) lines.push((r || []).map(c => String(c ?? '').trim()).filter(Boolean).join(' — ')); }
    }
    return items.length ? { items } : { lines };
  }
  if (/\.(txt|md|markdown|text)$/.test(n) || file.type.startsWith('text/')) return { lines: (await file.text()).split(/\r?\n/) };
  if (n.endsWith('.doc')) return { lines: docLines(await file.arrayBuffer()) };
  if (/\.(ppt|xls|pages|key|rtf)$/.test(n)) throw new Error('Ese formato antiguo no se puede leer aquí. Guárdalo como PDF, .docx o .xlsx, o pega el texto.');
  throw new Error('Formato no reconocido. Usa PDF, Word (.docx), PowerPoint (.pptx), Excel, CSV o texto.');
}

/* ---------- Word 97-2003 (.doc): archivo compuesto OLE + tabla de piezas ---------- */
function cfbRead(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1) throw new Error('No es un documento de Office antiguo válido');
  const ss = 1 << dv.getUint16(0x1E, true), ms = 1 << dv.getUint16(0x20, true);
  const cutoff = dv.getUint32(0x38, true), END = 0xFFFFFFFE;
  const off = s => (s + 1) * ss;
  const fatSecs = [];
  for (let i = 0; i < 109; i++) { const s = dv.getUint32(0x4C + i * 4, true); if (s < 0xFFFFFFFA) fatSecs.push(s); }
  let d = dv.getUint32(0x44, true), guard = 0;
  while (d < 0xFFFFFFFA && guard++ < 10000) {
    for (let i = 0; i < ss / 4 - 1; i++) { const s = dv.getUint32(off(d) + i * 4, true); if (s < 0xFFFFFFFA) fatSecs.push(s); }
    d = dv.getUint32(off(d) + ss - 4, true);
  }
  const fat = new Uint32Array(fatSecs.length * ss / 4);
  fatSecs.forEach((s, k) => fat.set(new Uint32Array(buf.slice(off(s), off(s) + ss)), k * ss / 4));
  const chain = (start, table) => { const out = []; let s = start, g = 0; while (s < 0xFFFFFFFA && g++ < 1e6) { out.push(s); s = table[s]; } return out; };
  const readBig = (start, size) => { const out = new Uint8Array(chain(start, fat).length * ss); chain(start, fat).forEach((s, k) => out.set(u8.subarray(off(s), off(s) + ss), k * ss)); return size != null ? out.subarray(0, size) : out; };
  const dir = readBig(dv.getUint32(0x30, true));
  const ents = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const e = new DataView(dir.buffer, dir.byteOffset + o, 128), nl = e.getUint16(0x40, true);
    const name = new TextDecoder('utf-16le').decode(dir.subarray(o, o + Math.max(0, nl - 2)));
    ents.push({ name, type: e.getUint8(0x42), start: e.getUint32(0x74, true), size: e.getUint32(0x78, true) });
  }
  const root = ents[0], mini = root ? readBig(root.start, root.size) : new Uint8Array();
  const mfSec = dv.getUint32(0x3C, true);
  const minifat = mfSec < 0xFFFFFFFA ? new Uint32Array(readBig(mfSec).buffer.slice(0)) : new Uint32Array();
  return name => {
    const e = ents.find(x => x.type === 2 && x.name === name); if (!e) return null;
    if (e.size >= cutoff) return readBig(e.start, e.size);
    const secs = chain(e.start, minifat), out = new Uint8Array(secs.length * ms);
    secs.forEach((s, k) => out.set(mini.subarray(s * ms, s * ms + ms), k * ms));
    return out.subarray(0, e.size);
  };
}
function docLines(buf) {
  const get = cfbRead(buf), wd = get('WordDocument');
  if (!wd) throw new Error('No encontré el texto del documento de Word');
  const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  if (dv.getUint16(0, true) !== 0xA5EC) throw new Error('Formato de Word no reconocido');
  const table = get(dv.getUint16(0x0A, true) & 0x0200 ? '1Table' : '0Table');
  const csw = dv.getUint16(32, true), lw = 34 + csw * 2 + 2, cslw = dv.getUint16(34 + csw * 2, true);
  const ccpText = dv.getUint32(lw + 12, true), fc0 = lw + cslw * 4 + 2;
  const fcClx = dv.getUint32(fc0 + 33 * 8, true), lcbClx = dv.getUint32(fc0 + 33 * 8 + 4, true);
  const t = new DataView(table.buffer, table.byteOffset, table.byteLength);
  let p = fcClx, text = '';
  const cp1252 = new TextDecoder('windows-1252'), u16 = new TextDecoder('utf-16le');
  while (p < fcClx + lcbClx) {
    const k = t.getUint8(p);
    if (k === 1) { p += 3 + t.getInt16(p + 1, true); continue; }
    if (k !== 2) break;
    const lcb = t.getUint32(p + 1, true), base = p + 5, n = (lcb - 4) / 12;
    for (let i = 0; i < n; i++) {
      const c0 = t.getUint32(base + i * 4, true), c1 = t.getUint32(base + (i + 1) * 4, true);
      const raw = t.getUint32(base + (n + 1) * 4 + i * 8 + 2, true), comp = raw & 0x40000000, fc = raw & 0x3FFFFFFF;
      text += comp ? cp1252.decode(wd.subarray(fc / 2, fc / 2 + (c1 - c0))) : u16.decode(wd.subarray(fc, fc + 2 * (c1 - c0)));
    }
    break;
  }
  if (!text) throw new Error('No pude leer el texto de este .doc. Guárdalo como .docx o PDF.');
  text = text.slice(0, ccpText || text.length)
    .replace(/\x13[^\x13\x14\x15]*\x14/g, '').replace(/\x13[^\x13\x14\x15]*\x15/g, '').replace(/[\x14\x15]/g, '')
    .replace(/[\x0B\x0C]/g, '\r').replace(/\x07/g, '\r').replace(/[\x00-\x08\x0E-\x1F]/g, '');
  return text.split(/\r\n?|\n/);
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
const ESP_WORDS = 'rm|tc|tac|eco|ecografia|neuro|neurorradiologia|mama|mamas|mamo|negato|torax|digestivo|doppler|pediatria|msk|cuerpo|intervencional|osteo|musculoesqueletico';
/** Encabezado de mes: «Mes 2», «Segundo mes», «Semana 5», «Marzo», «RM 1», «Mama 2», «PROGRAMA MES II», «Rotación Tórax II», «Temario de prueba digestivo 1». */
function monthHeader(n) {
  if (n.length > 90 || /deber|al final|sumar|periodo|este curso/.test(n)) return null;         // frases de objetivos, no títulos
  let m;
  if ((m = n.match(/^(?:mes|month)\s*(?:n[°ºo.]*\s*)?(\d{1,2}|iv|v?i{1,3}|uno|dos|tres|cuatro|cinco|seis)\b/))) return { mes: numFrom(m[1]), len: m[0].length };
  if ((m = n.match(/^(primer|primero|primera|segundo|segunda|tercer|tercero|tercera|cuarto|cuarta|quinto|sexto)\s+mes\b/))) return { mes: String(ORD[m[1]]), len: m[0].length };
  if ((m = n.match(/^semanas?\s*(\d{1,2})(?:\s*(?:a|al|-|–|y|hasta)\s*(\d{1,2}))?\b/))) return { mes: String(Math.ceil(Number(m[1]) / 4)), len: m[0].length };
  if ((m = n.match(new RegExp('^(' + CAL.join('|') + ')\\b')))) return { cal: m[1], len: m[0].length };
  if (n.split(/\s+/).length <= 12 && !/[.;]$/.test(n)) {                                       // título corto con el mes en cualquier parte
    if ((m = n.match(/\b(?:mes|month)\s*(?:n[°ºo.]*\s*)?(\d{1,2}|iv|v?i{1,3})\b/))) return { mes: numFrom(m[1]), len: n.length, whole: true };
    if ((m = n.match(/\b(primer|primero|primera|segundo|segunda|tercer|tercero|tercera|cuarto|cuarta)\s+mes\b/))) return { mes: String(ORD[m[1]]), len: n.length, whole: true };
    if ((m = n.match(new RegExp('\\b(?:' + ESP_WORDS + ')\\s+(\\d|iv|i{1,3})\\s*[:)]?\\s*(?:\\(.*\\))?$')))) return { mes: numFrom(m[1]), len: n.length, whole: true };
    if ((m = n.match(/\btemario\b[^.]{0,60}?\b(\d)\b/))) return { mes: m[1], len: n.length, whole: true };
  }
  return null;
}
const ESP_HEAD = [
  ['Neurorradiología', ['neurorradiologia', 'neuroradiologia', 'neuro', 'neuroimagenes']],
  ['Musculoesquelético', ['musculoesqueletico', 'musculo esqueletico', 'msk', 'osteoarticular', 'radiologia musculoesqueletica', 'osteo']],
  ['Pediatría', ['pediatria', 'radiologia pediatrica', 'imagenes pediatricas', 'pediatrica']],
  ['Imágenes mamarias', ['imagenes mamarias', 'mama', 'mamas', 'mamaria', 'radiologia mamaria', 'mamo', 'mamografia']],
  ['Digestivo', ['digestivo', 'gastrointestinal', 'radiologia digestiva']],
  ['Intervencional', ['intervencional', 'radiologia intervencional', 'intervencionismo']],
  ['TC de cuerpo', ['tc de cuerpo', 'tc cuerpo', 'tomografia computada de cuerpo', 'body ct', 'tac abdomen', 'tac abd', 'tc abdomen', 'abdomen pelvis', 'abd pelvis', 'tac de cuerpo']],
  ['MR de cuerpo', ['mr de cuerpo', 'rm de cuerpo', 'resonancia de cuerpo', 'rm cuerpo', 'mr cuerpo', 'body mr', 'resonancia magnetica de cuerpo', 'rm', 'resonancia']],
  ['Ecografía Doppler', ['ecografia doppler', 'doppler', 'eco doppler']],
  ['Ecografía gris', ['ecografia gris', 'eco gris', 'ecografia general', 'ecografia', 'eco']],
  ['Negato', ['negato', 'negatoscopio', 'radiologia simple', 'radiografia simple', 'torax']]
];
function espFromHeader(n, loose = false) {
  const s = n.replace(/^(?:(?:temario|programa|rotacion|modulo|unidad|de|del|en|la)\b\s*:?\s*)+/, '').replace(/[:.\-–—]+$/, '').trim();
  for (const [esp, syn] of ESP_HEAD) if (syn.includes(s)) return esp;
  if (loose) { const e = typeof normEsp === 'function' ? normEsp(s) : ''; return ESPECIALIDADES.includes(e) ? e : ''; }
  return '';
}
/** Especialidad mencionada dentro de un título («Rotación de radiología pediátrica», «PROGRAMA ROTACIÓN TAC ABDOMEN-PELVIS») o de un nombre de archivo. */
function espInText(n) {
  const t = ' ' + n.replace(/[_\-–—]+/g, ' ') + ' ';
  const all = ESP_HEAD.flatMap(([esp, syn]) => syn.map(w => [esp, w])).sort((a, b) => b[1].length - a[1].length);
  for (const [esp, w] of all) if (new RegExp(`[^a-z]${w.replace(/ /g, '\\s+')}[^a-z]`).test(t)) return esp;
  return '';
}
function hintsFromName(name) {
  const n = norm(String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' '));
  let mes = '';
  const m = n.match(/(?:mes|month)\s*(\d)/) || n.match(/\b(primer|segundo|tercer|cuarto)\s+mes\b/) || n.match(/(?:^|\s)(\d)(?=\D*$)/);
  if (m) mes = /\d/.test(m[1]) ? m[1] : String(ORD[m[1]] || '');
  return { mes, esp: espInText(n) };
}

/* Bloques que no son temario (CanMEDS salvo «experto médico», evaluación, bibliografía…) */
const ENUM = /^(?:[ivxlc]+|\d+(?:\.\d+)*|[a-h]\d?)\s*[.)\-]+\s*/;
const SKIP_HEAD = /^(comunicador|colaborador|administrador|promotor( de (la )?salud)?|academico|profesional|evaluaci(on|ones)|actividad(es)?\b.*|bibliografia.*|referencias|papers|articulos|recursos online|texto guia|informacion general|objetivos? generales?|descripcion|instancias (formativas|sumativas)|coordinador.*|docentes?\b.*|duracion.*|lugar.*|vacantes.*|base tecnica)\s*:?$/;
const BASE_HEAD = /^(experto medico|medico experto|base teorica|objetivos? especificos?\b.*)/;
const CURR_HEAD = /^(curriculum.*|curricular.*|temario.*|anexo\s*\d*|objetivos academicos.*|.* por mes)$/;
const REF_HEAD = /^contenido teorico/;
const NOISE = /^(\d+|pagina \d+( de \d+)?|temario|programa|contenidos?|indice|introduccion|presentacion|horario|docentes?)\s*:?$/;
const JUNK = /^(al final|al finalizar|en relacion a|con el fin|durante este periodo|este curso|en este curso|el curso|se espera|ademas de los temas|escuela de medicina|pontificia universidad|direccion de postgrado|programa de especialidad medica|hospital clinico|departamento de radiologia|dichas competencias|especialistas, se establecen|rotacion, que incluye)|canmeds|telefono|\bfax\b|marcoleta|\bpiso \d|examenes pediatricos|portafolio|pauta de evaluacion|nota \d[.,]\d|ponderaci/;
const REFLINE = /(radiographics|radiology\s*[.;:\d]|american journal|\bajr\b|et al\b|published by|hardcover|\bisbn\b|https?:\/\/|\bdoi\b|\(\d{4}\)|\b(19|20)\d{2}\s*;\s*\d)/;
const VERB = '(?:reconocer|identificar|describir|nombrar|manejar|construir|caracterizar|correlacionar|utilizar|aplicar|conocer|contrastar|diferenciar|distinguir|listar|indicar|sugerir|realizar|encontrar|enumerar|citar|definir|explicar|evaluar|localizar|detectar|plantear|comparar|establecer|determinar|mencionar|analizar|interpretar|protocolizar|comprender|adquirir|integrar|crear|mostrar|demostrar|ser capaz de)';
const LEAD_RE = new RegExp('^' + VERB + '(?:\\s+(?:e|y|o)\\s+' + VERB + ')?(?:\\s+(?:en forma\\s+)?(?:apropiadamente|adecuadamente|apropiada|sistematica|correctamente|adecuada))?\\s+', 'i');
const GEN_RE = /^(?:(?:el|la|los|las|un|una|sus|su)\s+)?(?:(?:caracteristicas|caracteres|hallazgos|alteraciones|patrones|signos|criterios|cambios|manifestaciones|formas|elementos)\s+(?:(?:imagenologic\w+|tomografic\w+|habituales|propi\w+|tipic\w+|distintiv\w+|clasic\w+|relevantes|morfologic\w+|lesionales|principales|radiologic\w+|normales)\s*)*(?:(?:y|e)\s+\w+\s+)?(?:de\s+(?:la|las|los|el|un|una)\s+|de\s+|del\s+|en\s+|que\s+)?)?/i;
const CUT_RE = /,?\s+(?:incluyendo|con enfasis|y contrastar|contrastandol\w*|contrastando|diferenciandol\w*|diferenciando|reconociendo|identificando|y describir|y reconocer|y definir|y nombrar|asi como|y sus diferencias|y aportar|para cada)\b.*$/i;
/** «Reconocer las características habituales de un X, incluyendo …» → «X». Trabaja sobre el texto sin tildes para ubicar cortes y los aplica al original. */
function condenseObjective(t) {
  let s = t.replace(/\*+/g, '').split(/(?<=[a-záéíóú)”"])\.\s+(?=[A-ZÁÉÍÓÚ])/)[0].replace(/[.*\s]+$/, '');
  const cut = re => { const n = norm(s), m = n.match(re); if (m && m[0].length) s = n.indexOf(m[0]) === 0 ? s.slice(m[0].length) : s.slice(0, n.length - m[0].length); };
  const before = s;
  cut(LEAD_RE); if (s === before) return t.replace(/\s+/g, ' ').trim();
  cut(GEN_RE);
  const keep = s; cut(CUT_RE); if (s.length < 12) s = keep;
  s = s.replace(/^[\s,:;]+/, '').replace(/[\s,:;]+$/, '');
  return s ? s[0].toUpperCase() + s.slice(1) : t;
}
const isAllCaps = t => /[A-ZÁÉÍÓÚÑ]{2}/.test(t) && t === t.toUpperCase();
const capFirst = t => { const l = isAllCaps(t) ? t.toLowerCase() : t; return l.charAt(0).toUpperCase() + l.slice(1); };
const BULLET = /^(?:[-•●▪◦■□*·–—>#○◆▶✓]+\s*|\(?\d{1,3}(?:\.\d{1,3})*[.)]?-?\s+|\(?\d{1,3}(?:\.\d{1,3})*[.)]-?|[a-zA-Z][.)]\s*|[ivxlcIVXLC]+\s*[.)]-?\s*)/;
/** Une líneas cortadas por el diseño del PDF: la frase sigue si la línea anterior termina en coma, preposición o sin punto y la siguiente empieza en minúscula. */
function joinWrapped(lines) {
  const out = [];
  for (const raw of lines) {
    const t = String(raw ?? '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
    if (!t) { out.push(''); continue; }
    const prev = out.length ? out[out.length - 1] : '';
    const cont = prev && !BULLET.test(t) && !(isAllCaps(prev) && prev.length < 60) && (/^[a-záéíóúñ(]/.test(t) && !/\.[*\s]*$/.test(prev) || !/[.:;!?][*\s]*$/.test(prev) && /(?:,|-|–|\b(?:de|del|la|las|el|los|y|e|o|u|en|con|por|para|a|al|un|una|que|sus|su|entre|como|sobre|según|desde|sin))$/i.test(prev));
    if (cont) out[out.length - 1] = prev.replace(/(\w)-$/, '$1') + (/(\w)-$/.test(prev) ? '' : ' ') + t;
    else out.push(t);
  }
  return out.filter(Boolean);
}

/** Convierte líneas de texto en temas con mes y especialidad, adaptándose a programas, objetivos y listas. */
function parseTemarioLines(lines, fallbackEsp = '', hints = {}) {
  const L = joinWrapped(lines);
  let mes = hints.mes && false ? hints.mes : '', esp = hints.esp || '', inBib = false, skip = false, block = '', heading = '', sub = '';
  const calOrder = [], items = [], espsFound = new Set();
  let monthsFound = false;
  const push = (txt, extra = {}) => {
    let tema = txt.replace(/\s+/g, ' ').trim();
    if (tema.length < 3) return;
    items.push({ tema: tema.slice(0, 240), mes, esp, block, ctx: sub || heading, ...extra });
  };
  const nextStarts = i => { for (let k = i + 1; k < L.length && k < i + 3; k++) return BULLET.test(L[k]) || new RegExp('^' + VERB, 'i').test(norm(L[k])); return false; };
  for (let i = 0; i < L.length; i++) {
    const s = L[i];
    const hadBullet = BULLET.test(s);
    const clean = s.replace(BULLET, '').replace(/^[\s:.\-–—]+/, '').trim();
    if (!clean) continue;
    const n = norm(clean), nFull = norm(s);
    const headNorm = n.replace(ENUM, '').replace(/[:\s]+$/, '');
    // mes
    const titleLike = /^[A-ZÁÉÍÓÚÑ0-9(]/.test(clean) || /^[A-ZÁÉÍÓÚÑ0-9(]/.test(s);
    let mh = monthHeader(n) || (n !== nFull ? monthHeader(nFull) : null);
    if (mh && mh.whole && !titleLike) mh = null;
    if (mh) {
      if (mh.cal) { if (!calOrder.includes(mh.cal)) calOrder.push(mh.cal); mes = String(calOrder.indexOf(mh.cal) + 1); }
      else mes = mh.mes;
      monthsFound = true; inBib = false; skip = false; heading = ''; sub = '';
      const e = espInText(n); if (e && /(rotacion|programa|temario|objetivos|curriculum|radiologia|\b(rm|eco|neuro|mama|negato|torax|doppler|digestivo)\s)/.test(n)) { esp = e; espsFound.add(e); }
      if (CURR_HEAD.test(headNorm) || /temario|curriculum|anexo|objetivos academicos/.test(n)) block = 'curr';
      if (!mh.whole) { const rest = clean.split(/\s*[:–—]\s*|\s+-\s+/).slice(1).join(': ').trim(); if (rest.length > 3 && !monthHeader(norm(rest))) push(rest); }
      continue;
    }
    // especialidad (línea que solo la nombra, o título de programa)
    if (n.length <= 70) {
      const bare = espFromHeader(headNorm), titled = /(rotacion|programa|temario|objetivos)/.test(n) ? espInText(n) : '';
      if (titled) { esp = titled; espsFound.add(titled); inBib = false; }
      else if (bare && !esp && !hadBullet) { esp = bare; espsFound.add(bare); inBib = false; continue; }
    }
    // bloques
    if (BIB.test(headNorm) || /^bibliografia/.test(headNorm)) { inBib = true; continue; }
    if (SKIP_HEAD.test(headNorm)) { skip = true; continue; }
    if (BASE_HEAD.test(headNorm)) { skip = false; inBib = false; block = 'base'; sub = ''; continue; }
    if (CURR_HEAD.test(headNorm)) { skip = false; inBib = false; block = 'curr'; sub = ''; if (/ por mes$/.test(headNorm)) heading = capFirst(clean.replace(/\s*por mes\s*$/i, '')); continue; }
    if (REF_HEAD.test(headNorm)) { skip = false; block = 'ref'; continue; }
    if (skip || inBib) continue;
    if (JUNK.test(n) || NOISE.test(headNorm) || /^[\W_]+$/.test(n) || REFLINE.test(n)) continue;
    // títulos de sección: numeración romana o MAYÚSCULAS, cortos; o línea corta seguida de viñetas
    const words = headNorm.split(/\s+/).length;
    const roman = /^[ivxlc]+\s*[.)\-]/.test(nFull) && words <= 7;
    if (words <= 7 && !/[.;]$/.test(clean) && !new RegExp('^' + VERB, 'i').test(n) && (roman || (isAllCaps(clean.replace(ENUM, '')) && (!hadBullet || /^\d/.test(s))) || (!hadBullet && words <= 5 && nextStarts(i)))) {
      heading = capFirst(clean.replace(ENUM, '').replace(/[:\s]+$/, '')); sub = ''; continue;
    }
    if (/:$/.test(clean) && words <= 6 && !new RegExp('^' + VERB, 'i').test(n)) { sub = capFirst(clean.replace(/:$/, '')); continue; }   // subtítulo «Síndromes neurocutáneos:»
    if (/^\d/.test(s)) sub = '';
    const isObj = new RegExp('^' + VERB, 'i').test(n);
    push((isObj ? condenseObjective(clean) : clean).replace(/[:\s]+$/, ''), { original: isObj ? clean : '' });
  }
  return finishParse(items, { monthsFound, espsFound: [...espsFound], fallbackEsp, hints });
}
/** Mes y especialidad por defecto, preferencia del currículum sobre los objetivos, contexto del título y duplicados internos. */
function finishParse(items, { monthsFound, espsFound, fallbackEsp = '', hints = {} }) {
  for (const it of items) {
    if (!it.mes && hints.mes) it.mes = hints.mes;
    if (!it.esp) it.esp = hints.esp || fallbackEsp;
  }
  const hasCurr = items.some(it => it.block === 'curr');
  let out = items.filter(it => !(hasCurr && (it.block === 'base' || it.block === 'ref')));   // si hay currículum o temario, manda sobre objetivos y listas generales
  for (const it of out) {                                                            // contexto del título si el tema quedó ambiguo
    if (!it.ctx) continue;
    const t = norm(it.tema), c = norm(it.ctx);
    const cw = c.split(/[^a-z0-9]+/).filter(w => w.length > 3);
    if (it.tema.length <= 70 && !cw.every(w => t.includes(w.slice(0, 5)))) it.tema = `${it.ctx}: ${it.tema}`;
  }
  const seen = new Set();
  out = out.filter(it => { const k = `${it.esp}|${it.mes}|${norm(it.tema)}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (hints.fuente) for (const it of out) it.fuente = it.fuente || hints.fuente;
  return { items: out, monthsFound: monthsFound || !!hints.mes, espsFound: [...new Set([...espsFound, ...(hints.esp ? [hints.esp] : [])])] };
}
const BIB = /^(bibliografia|referencias|lecturas? (recomendadas?|sugeridas?)|literatura)\b.*$/;

/* ---------- Duplicados: entre temas del mismo archivo, entre archivos y con el temario que ya tienes ---------- */
function temaStems(t) { return new Set([...stems(t)].filter(w => w.length >= 4)); }
const _orgCache = new Map();
const organOf = (esp, t) => { const k = esp + '|' + t; if (!_orgCache.has(k)) _orgCache.set(k, classifyText(esp, t).organo); return _orgCache.get(k); };
/** Mismo tema con otras palabras: casi las mismas raíces, o la mayoría de las raíces del más corto y el mismo órgano. */
function similar(a, b, esp = '') {
  const A = temaStems(a), B = temaStems(b);
  if (!A.size || !B.size) return norm(a) === norm(b);
  let i = 0; for (const w of A) if (B.has(w)) i++;
  if (i / (A.size + B.size - i) >= 0.75) return true;
  if (i >= 2 && i / Math.min(A.size, B.size) >= 0.8) {
    const oa = organOf(esp, a), ob = organOf(esp, b);
    return !!oa && oa === ob;
  }
  return false;
}
function markDuplicates(items, existing) {
  // Solo se desmarca lo repetido en el MISMO mes; un tema que se repite en otro mes es válido y queda marcado con un aviso.
  const byEsp = {};
  for (const t of existing) (byEsp[t.especialidad] = byEsp[t.especialidad] || []).push(t);
  const kept = [];
  const sameTema = (a, b, it) => (it.structured && b.structured ? norm(a) === norm(b.tema) : similar(a, b.tema, it.esp));
  for (const it of items) {
    it.dup = ''; it.also = '';
    const mes = String(it.mes || ''), n = norm(it.tema);
    const ex = (byEsp[it.esp] || []).filter(t => similar(t.tema, it.tema, it.esp));
    const exSame = ex.find(t => String(t.mes || '') === mes);
    if (exSame) { it.dup = `ya en tu temario${mes ? ' (mes ' + mes + ')' : ''}`; continue; }
    const prev = kept.filter(k => k.esp === it.esp && (sameTema(it.tema, k, it) || (!it.structured && n.length < 40 && norm(k.tema).startsWith(n + ':'))));
    const prevSame = prev.find(k => String(k.mes || '') === mes);
    if (prevSame) { it.dup = 'repetido en este mes'; continue; }
    const otros = [...new Set([...ex.map(t => t.mes), ...prev.map(k => k.mes)].filter(m => m && String(m) !== mes))].sort();
    if (otros.length) it.also = `también en mes ${otros.join(' y ')}`;
    kept.push(it);
  }
  // un título suelto («Hígado») que ya aparece como prefijo de temas más específicos
  for (const it of items) if (!it.dup && !it.structured && it.tema.length < 40) {
    const n = norm(it.tema);
    if (items.some(o => o !== it && o.esp === it.esp && norm(o.tema).startsWith(n + ':'))) it.dup = 'título de sección';
  }
  return items;
}

/* ---------------- Relación tema ↔ caso ---------------- */
const STOP = new Set(('de la el los las del y en con por para sin una uno unos unas que se su sus al lo como mas menos o u a e entre sobre desde hasta ' +
  'segun tipo tipos otro otra otros otras caso casos paciente pacientes estudio estudios imagen imagenes hallazgo hallazgos evaluacion diagnostico ' +
  'diagnostica diferencial diferenciales enfermedad enfermedades patologia patologias lesion lesiones anatomia normal generalidades introduccion ' +
  'clase manejo aspectos principales conceptos basicos tecnica radiologia radiologico radiologica imagenologia rol utilidad mes semana tema temas ' +
  'parte partes vs versus the and of lesiones asociada asociadas asociado asociados completa completo parcial aguda agudo agudos agudas ' +
  'cronica cronico bilateral derecha derecho izquierda izquierdo signo signos control grado grados bajo baja alto alta leve moderado ' +
  'moderada severo severa extenso extensa grande gran pequeno pequena multiple multiples unico unica aislado aislada').split(' '));
function stems(text) {
  const out = new Set();
  for (const w of norm(text).split(/[^a-z0-9]+/)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    const b = w.length > 5 ? w.replace(/(?:es|s)$/, '') : w;           // plural → singular («tumores» = «tumor»)
    out.add(b.length > 7 ? b.slice(0, 7) : b);                          // 7 letras: «condrosarcoma» ≠ «condroblastoma»
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
      const st = stems(t.tema + ' ' + (t.detalle || ''));
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
