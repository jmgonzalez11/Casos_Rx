'use strict';
/* =====================================================================
   Literatura: lee PDF, Word, texto o imágenes y devuelve
   - figuras recortadas con su leyenda (JPEG completo + miniatura),
   - el texto ordenado por columnas y separado en secciones,
   - la fuente probable (STATdx, Radiopaedia, paper) y el título.
   Todo ocurre en el dispositivo. Depende de temario.js (loadPdfjs) y
   de app.js (norm, unzip).
   ===================================================================== */

/* ---------- Inglés → español para clasificar material en inglés ---------- */
const EN_ES = [
  ['hepatocellular carcinoma', 'hepatocarcinoma'], ['focal nodular hyperplasia', 'hiperplasia nodular focal'], ['multiple sclerosis', 'esclerosis multiple'],
  ['white matter', 'sustancia blanca'], ['pulmonary embolism', 'tromboembolismo pulmonar'], ['spinal cord', 'medula espinal'], ['soft tissue', 'partes blandas'],
  ['paranasal sinus', 'senos paranasales'], ['temporal bone', 'hueso temporal'], ['avascular necrosis', 'necrosis avascular'], ['rotator cuff', 'manguito rotador'],
  ['anterior cruciate ligament', 'ligamento cruzado anterior lca'], ['posterior cruciate ligament', 'ligamento cruzado posterior lcp'], ['cruciate ligament', 'ligamento cruzado'],
  ['bile duct', 'via biliar'], ['gallbladder', 'vesicula biliar'], ['small bowel', 'intestino delgado'], ['large bowel', 'colon'], ['pituitary', 'hipofisis'],
  ['subarachnoid hemorrhage', 'hemorragia subaracnoidea'], ['subdural hematoma', 'hematoma subdural'], ['epidural hematoma', 'hematoma epidural'],
  ['venous thrombosis', 'trombosis venosa'], ['deep vein thrombosis', 'trombosis venosa profunda tvp'], ['aortic dissection', 'diseccion aortica'],
  ['stroke', 'acv infarto'], ['infarct', 'infarto'], ['hemorrhage', 'hemorragia'], ['haemorrhage', 'hemorragia'], ['hematoma', 'hematoma'],
  ['liver', 'higado'], ['hepatic', 'hepatico'], ['biliary', 'biliar'], ['pancreatic', 'pancreatico'], ['pancreas', 'pancreas'], ['spleen', 'bazo'], ['splenic', 'esplenico'],
  ['adrenal', 'suprarrenal'], ['kidney', 'rinon'], ['kidneys', 'rinones'], ['renal', 'renal'], ['ureter', 'ureter'], ['bladder', 'vejiga'], ['urethra', 'uretra'],
  ['bowel', 'intestino'], ['stomach', 'estomago'], ['gastric', 'gastrico'], ['esophagus', 'esofago'], ['esophageal', 'esofagico'], ['duodenum', 'duodeno'], ['rectum', 'recto'],
  ['appendix', 'apendice'], ['peritoneum', 'peritoneo'], ['mesentery', 'mesenterio'], ['abdomen', 'abdomen'], ['pelvis', 'pelvis'],
  ['brain', 'cerebro'], ['cerebral', 'cerebral'], ['cerebellum', 'cerebelo'], ['brainstem', 'tronco encefalico'], ['spine', 'columna'], ['spinal', 'espinal'],
  ['vertebral', 'vertebral'], ['disc', 'disco'], ['orbit', 'orbita'], ['orbital', 'orbitario'], ['sinus', 'seno'], ['neck', 'cuello'], ['thyroid', 'tiroides'],
  ['larynx', 'laringe'], ['pharynx', 'faringe'], ['parotid', 'parotida'], ['salivary', 'salival'], ['skull base', 'base de craneo'],
  ['shoulder', 'hombro'], ['elbow', 'codo'], ['wrist', 'muneca'], ['hand', 'mano'], ['hip', 'cadera'], ['knee', 'rodilla'], ['ankle', 'tobillo'], ['foot', 'pie'],
  ['meniscus', 'menisco'], ['meniscal', 'meniscal'], ['labrum', 'labrum'], ['labral', 'labral'], ['tendon', 'tendon'], ['ligament', 'ligamento'], ['cartilage', 'cartilago'],
  ['muscle', 'musculo'], ['bone', 'hueso'], ['marrow', 'medula osea'], ['nerve', 'nervio'], ['joint', 'articulacion'],
  ['lung', 'pulmon'], ['lungs', 'pulmones'], ['pulmonary', 'pulmonar'], ['pleural', 'pleural'], ['mediastinal', 'mediastinico'], ['mediastinum', 'mediastino'],
  ['heart', 'corazon'], ['cardiac', 'cardiaco'], ['pericardial', 'pericardico'], ['aorta', 'aorta'], ['aortic', 'aortico'], ['breast', 'mama'], ['axillary', 'axilar'],
  ['ovary', 'ovario'], ['ovarian', 'ovarico'], ['uterus', 'utero'], ['uterine', 'uterino'], ['cervix', 'cervix'], ['prostate', 'prostata'], ['testis', 'testiculo'],
  ['testicular', 'testicular'], ['scrotal', 'escrotal'], ['placenta', 'placenta'], ['fetal', 'fetal'],
  ['tumour', 'tumor'], ['tumor', 'tumor'], ['mass', 'masa'], ['cyst', 'quiste'], ['cystic', 'quistico'], ['nodule', 'nodulo'], ['lesion', 'lesion'],
  ['metastasis', 'metastasis'], ['metastases', 'metastasis'], ['metastatic', 'metastasico'], ['lymphoma', 'linfoma'], ['carcinoma', 'carcinoma'],
  ['cancer', 'cancer'], ['sarcoma', 'sarcoma'], ['adenoma', 'adenoma'], ['hemangioma', 'hemangioma'], ['cholangiocarcinoma', 'colangiocarcinoma'],
  ['fracture', 'fractura'], ['tear', 'rotura'], ['rupture', 'rotura'], ['dislocation', 'luxacion'], ['sprain', 'esguince'], ['trauma', 'trauma'], ['injury', 'lesion'],
  ['infection', 'infeccion'], ['abscess', 'absceso'], ['inflammation', 'inflamacion'], ['inflammatory', 'inflamatorio'], ['osteomyelitis', 'osteomielitis'],
  ['arthritis', 'artritis'], ['osteoarthritis', 'artrosis'], ['gout', 'gota'], ['osteonecrosis', 'osteonecrosis'], ['aneurysm', 'aneurisma'],
  ['thrombosis', 'trombosis'], ['embolism', 'embolia'], ['dissection', 'diseccion'], ['stenosis', 'estenosis'], ['occlusion', 'oclusion'], ['ischemia', 'isquemia'],
  ['hernia', 'hernia'], ['obstruction', 'obstruccion'], ['volvulus', 'volvulo'], ['intussusception', 'invaginacion'], ['perforation', 'perforacion'],
  ['appendicitis', 'apendicitis'], ['diverticulitis', 'diverticulitis'], ['pancreatitis', 'pancreatitis'], ['cholecystitis', 'colecistitis'],
  ['pyelonephritis', 'pielonefritis'], ['pneumonia', 'neumonia'], ['hydrocephalus', 'hidrocefalia'], ['demyelinating', 'desmielinizante'],
  ['congenital', 'congenito'], ['pediatric', 'pediatrico'], ['children', 'ninos'], ['neonatal', 'neonatal'], ['dementia', 'demencia'], ['epilepsy', 'epilepsia'],
  ['glioma', 'glioma'], ['glioblastoma', 'glioblastoma'], ['meningioma', 'meningioma'], ['schwannoma', 'schwannoma'], ['sinusitis', 'sinusitis'],
  ['differential diagnosis', 'diagnostico diferencial'], ['imaging', 'imagen']
].sort((a, b) => b[0].length - a[0].length);
let _enRe = null;
/** Traduce términos frecuentes del inglés para que la taxonomía y el temario (en español) los reconozcan. */
function enToEs(text) {
  const t = norm(text);
  if (!_enRe) _enRe = new RegExp('(^|[^a-z])(' + EN_ES.map(p => p[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^a-z])', 'g');
  const map = Object.fromEntries(EN_ES);
  return t.replace(_enRe, (m, pre, w) => pre + map[w]);
}

/* ---------- Utilidades de imagen ---------- */
const canvasBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q));
function scaledCanvas(src, sw, sh, maxSide, sx = 0, sy = 0, cw = sw, ch = sh) {
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(cw * k)); c.height = Math.max(1, Math.round(ch * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, sx, sy, cw, ch, 0, 0, c.width, c.height);
  return c;
}
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
/** Genera la imagen completa (JPEG, lado mayor 1600 px) y la miniatura (data URL, 320 px). */
async function makeFigure(src, sx, sy, cw, ch) {
  const full = scaledCanvas(src, 0, 0, 1600, sx, sy, cw, ch);
  const thumb = scaledCanvas(full, full.width, full.height, 320);
  return { full: await canvasBlob(full, 0.85), thumb: await blobToDataURL(await canvasBlob(thumb, 0.7)), w: full.width, h: full.height };
}
function loadImageEl(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => res({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen (formato no soportado en este navegador)')); };
    img.src = url;
  });
}
async function figureFromImage(blob, caption = '') {
  const { img, url } = await loadImageEl(blob);
  try { return { ...(await makeFigure(img, 0, 0, img.naturalWidth, img.naturalHeight)), caption }; }
  finally { URL.revokeObjectURL(url); }
}

/* ---------- PDF: texto con posición ---------- */
function pdfSegments(items, vp) {
  const its = [];
  for (const it of items) {
    if (typeof it.str !== 'string' || !it.str.trim() || !it.transform) continue;
    const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    const size = Math.max(1, Math.hypot(it.transform[2], it.transform[3]) * vp.scale);
    its.push({ s: it.str, x0: x, x1: x + (it.width || 0) * vp.scale, base: y, size });
  }
  its.sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const segs = [];
  for (const it of its) {
    let seg = null;
    for (let k = segs.length - 1; k >= 0 && k >= segs.length - 16; k--) {
      const s = segs[k];
      if (Math.abs(s.base - it.base) <= Math.max(2, it.size * 0.45) && it.x0 >= s.x0 - 2 && it.x0 - s.x1 < Math.max(it.size, s.size) * 1.6) { seg = s; break; }
    }
    if (seg) {
      if (it.x0 - seg.x1 > seg.size * 0.15 && !/\s$/.test(seg.text) && !/^\s/.test(it.s)) seg.text += ' ';
      seg.text += it.s; seg.x1 = Math.max(seg.x1, it.x1); seg.size = Math.max(seg.size, it.size);
    } else segs.push({ text: it.s, x0: it.x0, x1: it.x1, base: it.base, size: it.size });
  }
  for (const s of segs) { s.text = s.text.replace(/\s+/g, ' ').trim(); s.top = s.base - s.size * 0.85; s.bottom = s.base + s.size * 0.25; }
  return segs.filter(s => s.text);
}

/* ---------- PDF: posición de las imágenes (seguimiento de la matriz de transformación) ---------- */
const mulM = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function pdfImageBoxes(ol, OPS, vp) {
  const boxes = [], stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const IMG = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintJpegXObject].filter(v => v !== undefined));
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mulM(ctm, a);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(a && a[0]) && a[0].length === 6) ctm = mulM(ctm, a[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (IMG.has(fn)) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => vp.convertToViewportPoint(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
  }
  // limpiar: fondos de página, iconos y cajas repetidas o superpuestas
  const W = vp.width, H = vp.height;
  let out = boxes.map(b => ({ x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(W, b.x1), y1: Math.min(H, b.y1) }))
    .filter(b => b.x1 - b.x0 >= 45 && b.y1 - b.y0 >= 45 && (b.x1 - b.x0) * (b.y1 - b.y0) < W * H * 0.85);
  const merged = [];
  for (const b of out.sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))) {
    const m = merged.find(c => {
      const ix = Math.min(c.x1, b.x1) - Math.max(c.x0, b.x0), iy = Math.min(c.y1, b.y1) - Math.max(c.y0, b.y0);
      return ix > 0 && iy > 0 && ix * iy > 0.6 * (b.x1 - b.x0) * (b.y1 - b.y0);
    });
    if (m) { m.x0 = Math.min(m.x0, b.x0); m.y0 = Math.min(m.y0, b.y0); m.x1 = Math.max(m.x1, b.x1); m.y1 = Math.max(m.y1, b.y1); }
    else merged.push({ ...b });
  }
  return merged;
}

/* ---------- Leyendas ---------- */
const CAP_START = /^(fig(ure|ura)?\.?\s*\d|imagen\s*\d|image\s*\d|case\s*\d|caso\s*\d|\((left|right|top|bottom|upper|lower|middle|center|centre|a|b|c|d|izquierda|derecha|superior|inferior)\b)/i;
const CAP_MARK = /\((left|right|top|bottom|upper|lower|middle|center|centre|izquierda|derecha|superior|inferior)[^)]{0,24}\)/gi;
function splitCaption(text) {
  const idx = [...text.matchAll(CAP_MARK)].map(m => m.index);
  if (idx.length < 2) return null;
  return idx.map((st, k) => text.slice(st, idx[k + 1] ?? text.length).trim());
}
const stripLabel = t => t.replace(/^\([^)]{0,30}\)\s*/, '').trim();
function assignCaptions(boxes, segs, used) {
  const sizes = segs.map(s => s.size).sort((a, b) => a - b), med = sizes[Math.floor(sizes.length / 2)] || 10;
  const rows = [];
  for (const b of [...boxes].sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0)) {
    const r = rows.find(r => Math.min(r.y1, b.y1) - Math.max(r.y0, b.y0) > 0.5 * Math.min(r.y1 - r.y0, b.y1 - b.y0));
    if (r) { r.items.push(b); r.y0 = Math.min(r.y0, b.y0); r.y1 = Math.max(r.y1, b.y1); r.x0 = Math.min(r.x0, b.x0); r.x1 = Math.max(r.x1, b.x1); }
    else rows.push({ items: [b], x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 });
  }
  rows.sort((a, b) => a.y0 - b.y0);
  rows.forEach(r => r.items.sort((a, b) => a.x0 - b.x0));
  const take = (list) => { list.forEach(c => used.add(c.i)); return list.map(c => c.s.text).join(' ').replace(/(\w)-\s(?=[a-záéíóúñ])/g, '$1').replace(/\s+/g, ' ').trim(); };
  rows.forEach((r, ri) => {
    const limit = rows[ri + 1] ? rows[ri + 1].y0 : Infinity;
    const near = s => s.x1 > r.x0 - 6 && s.x0 < r.x1 + 6 && s.x0 >= r.x0 - 30 && s.x1 <= r.x1 + 60;
    const below = segs.map((s, i) => ({ s, i })).filter(({ s, i }) => !used.has(i) && s.top >= r.y1 - 4 && s.top < limit && near(s)).sort((a, b) => a.s.top - b.s.top || a.s.x0 - b.s.x0);
    let cap = [], last = r.y1;
    for (const c of below) {
      const gap = c.s.top - last;
      if (!cap.length) {
        if (gap > Math.max(26, c.s.size * 2.6)) break;
        if (!CAP_START.test(c.s.text) && c.s.size > med * 0.97) break;     // texto normal, no leyenda
      } else if (gap > c.s.size * 1.3) break;
      cap.push(c); last = Math.max(last, c.s.bottom);
      if (cap.length >= 30) break;
    }
    r.caption = take(cap);
    if (!r.caption) {                                                        // leyenda arriba («Figure 2»)
      const above = segs.map((s, i) => ({ s, i })).filter(({ s, i }) => !used.has(i) && s.bottom <= r.y0 + 4 && s.bottom > r.y0 - 60 && near(s) && CAP_START.test(s.text));
      if (above.length) r.caption = take(above.slice(-1));
    }
  });
  // leyendas compartidas: «(Top) … (Bottom) …» bajo la segunda fila
  rows.forEach((r, ri) => {
    const nx = rows[ri + 1];
    if (!r.caption && nx && nx.caption) {
      const parts = splitCaption(nx.caption);
      if (parts && parts.length === r.items.length + nx.items.length) { r.parts = parts.slice(0, r.items.length); nx.parts = parts.slice(r.items.length); }
    }
  });
  const out = [];
  for (const r of rows) {
    const parts = r.parts || (r.items.length > 1 ? splitCaption(r.caption || '') : null);
    r.items.forEach((b, k) => out.push({ box: b, caption: parts && parts.length === r.items.length ? stripLabel(parts[k]) : (r.caption || '') }));
  }
  return out;
}

/* ---------- Orden de lectura por columnas ---------- */
function orderByColumns(segs, W) {
  const full = segs.filter(s => s.x1 - s.x0 > W * 0.55);
  const rest = segs.filter(s => !full.includes(s));
  const cnt = {};
  for (const s of rest) { const k = Math.round(s.x0 / 20) * 20; cnt[k] = (cnt[k] || 0) + 1; }
  const starts = Object.entries(cnt).filter(([, n]) => n >= Math.max(3, rest.length * 0.12)).map(([k]) => Number(k)).sort((a, b) => a - b);
  const colOf = s => { let c = 0; starts.forEach((x, i) => { if (s.x0 + 12 >= x) c = i; }); return c; };
  // cortes horizontales: líneas de ancho completo y espacios en blanco que atraviesan todas las columnas
  const sizes = segs.map(s => s.size).sort((a, b) => a - b), med = sizes[Math.floor(sizes.length / 2)] || 10;
  const gapCuts = [];
  const byTop = [...rest].sort((a, b) => a.top - b.top);
  let maxBottom = -Infinity;
  for (const s of byTop) {
    if (maxBottom > -Infinity && s.top - maxBottom > Math.max(18, med * 2.4)) gapCuts.push({ top: s.top - 1 });
    maxBottom = Math.max(maxBottom, s.bottom);
  }
  const cuts = [...full, ...gapCuts].sort((a, b) => a.top - b.top);
  const out = [];
  let prev = -Infinity;
  for (const f of [...cuts, { top: Infinity }]) {
    const band = rest.filter(s => s.top >= prev && s.top < f.top);
    band.sort((a, b) => colOf(a) - colOf(b) || a.top - b.top || a.x0 - b.x0);
    out.push(...band);
    if (f.text !== undefined) out.push(f);
    prev = f.top;
  }
  return out;
}

/* ---------- Lectura del PDF ---------- */
async function readPdfMaterial(buf, progress = () => {}) {
  const pdfjs = await loadPdfjs(), OPS = pdfjs.OPS;
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  const lines = [], figures = [];
  try {
    const N = Math.min(doc.numPages, 80);
    for (let p = 1; p <= N; p++) {
      progress(`Leyendo página ${p} de ${N}…`);
      const page = await doc.getPage(p), vp = page.getViewport({ scale: 1 });
      const segs = pdfSegments((await page.getTextContent()).items, vp);
      const boxes = pdfImageBoxes(await page.getOperatorList(), OPS, vp);
      const used = new Set();
      if (boxes.length) {
        const caps = assignCaptions(boxes, segs, used);
        const scale = Math.min(3, 1700 / vp.width), rv = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rv.width); canvas.height = Math.round(rv.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, canvas, viewport: rv }).promise;
        for (const c of caps) {
          const b = c.box;
          figures.push({ ...(await makeFigure(canvas, Math.round(b.x0 * scale), Math.round(b.y0 * scale),
            Math.round((b.x1 - b.x0) * scale), Math.round((b.y1 - b.y0) * scale))), caption: c.caption, page: p });
        }
        canvas.width = canvas.height = 0;
      }
      const body = orderByColumns(segs.filter((s, i) => !used.has(i)), vp.width);
      for (const s of body) lines.push({ text: s.text, size: s.size, page: p, top: s.top });
      page.cleanup();
    }
  } finally { await task.destroy(); }
  return { lines, figures };
}

/* ---------- Word (.docx): texto con estilos e imágenes con su leyenda ---------- */
async function readDocxMaterial(buf) {
  const z = await unzip(buf), P = new DOMParser();
  const doc = P.parseFromString(await z.text('word/document.xml') || '', 'text/xml');
  const relsT = await z.text('word/_rels/document.xml.rels');
  const rels = {};
  if (relsT) for (const r of P.parseFromString(relsT, 'text/xml').getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  const paras = [...doc.getElementsByTagName('w:p')].map(p => {
    const style = (p.getElementsByTagName('w:pStyle')[0] || { getAttribute: () => '' }).getAttribute('w:val') || '';
    const text = [...p.getElementsByTagName('*')].map(e => (e.localName === 't' ? e.textContent : e.localName === 'tab' || e.localName === 'br' ? ' ' : '')).join('').trim();
    const blips = [...p.getElementsByTagName('a:blip')].map(b => b.getAttribute('r:embed')).filter(Boolean);
    return { style, text, blips };
  });
  const lines = [], figures = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    if (p.blips.length) {
      const nx = paras[i + 1];
      const cap = nx && nx.text && !nx.blips.length && (/caption|descripci|leyenda/i.test(nx.style) || CAP_START.test(nx.text) || nx.text.length < 400) ? nx.text : '';
      for (const id of p.blips) {
        const target = rels[id]; if (!target) continue;
        const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
        const bytes = await z.bytes(path); if (!bytes) continue;
        const ext = path.split('.').pop().toLowerCase();
        if (!['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) continue;
        try { figures.push({ ...(await figureFromImage(new Blob([bytes], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) }), cap)) }); } catch { /* imagen ilegible */ }
      }
      if (cap) i++;
      continue;
    }
    if (!p.text) continue;
    const h = /heading|titulo|título|title/i.test(p.style);
    lines.push({ text: p.text, size: h ? 16 : 11, page: 1, head: h });
  }
  return { lines, figures };
}

/* ---------- Secciones, fuente, título y resumen ---------- */
const HEADS = /^(key facts|terminology|imaging|top differential diagnoses|differential diagnosis|pathology|clinical issues|diagnostic checklist|selected references|references|abstract|introduction|conclusion|conclusions|discussion|summary|teaching points|key points|essentials|background|methods|materials and methods|results|radiographic features|epidemiology|clinical presentation|treatment and prognosis|pathophysiology|etiology|history and etymology|practical points|resumen|introduccion|conclusion|conclusiones|discusion|hallazgos|diagnostico diferencial|epidemiologia|clinica|tratamiento|anatomia|fisiopatologia|bibliografia|referencias|definicion|puntos clave|perlas)\s*:?$/;
const STOP_HEADS = /^(selected references|references|bibliografia|referencias|acknowledg|agradecimientos|disclosures|conflicts of interest)/;
const isCaps = t => /[A-Z]/.test(t) && t === t.toUpperCase() && /^[^a-z]*$/.test(t);
function cleanLines(lines) {
  const pages = new Set(lines.map(l => l.page)).size;
  const freq = {};
  for (const l of lines) { const k = norm(l.text); freq[k] = (freq[k] || 0) + 1; }
  return lines.filter(l => {
    const k = norm(l.text);
    if (/^\d{1,4}$/.test(k) || /^(page|pagina)\s*\d+/.test(k)) return false;
    if (pages >= 3 && freq[k] >= Math.max(3, pages * 0.5)) return false;       // encabezados y pies repetidos
    if (/^(downloaded from|for personal use only|copyright|©|all rights reserved|this article|statdx\b.*elsevier)/.test(k)) return false;
    return true;
  });
}
function titleOf(lines) {
  const first = lines.filter(l => l.page === (lines[0] && lines[0].page)).slice(0, 40);
  if (!first.length) return '';
  const max = Math.max(...first.map(l => l.size));
  const sizes = lines.map(l => l.size).sort((a, b) => a - b), med = sizes[Math.floor(sizes.length / 2)] || max;
  if (max < med * 1.15) return first[0].text.slice(0, 160);
  const idx = first.findIndex(l => l.size >= max - 0.5);
  const parts = [first[idx].text];
  for (let k = idx + 1; k < first.length && first[k].size >= max - 0.5 && parts.length < 4; k++) parts.push(first[k].text);
  return parts.join(' ').replace(/\s*\|.*radiopaedia.*$/i, '').trim().slice(0, 200);
}
/** Texto → Markdown simple (## títulos, • viñetas, párrafos). Se detiene en la bibliografía. */
function linesToMd(lines, title) {
  const sizes = lines.map(l => l.size).sort((a, b) => a - b), med = sizes[Math.floor(sizes.length / 2)] || 10;
  const out = [];
  let para = '';
  const flush = () => { if (para.trim()) out.push(para.trim()); para = ''; };
  const tnorm = norm(title || '');
  for (const l of lines) {
    const t = l.text.trim(), n = norm(t);
    if (tnorm && n.length > 3 && tnorm.includes(n) && l.page === lines[0].page && l.size >= med * 1.2) continue;   // título (aunque ocupe varias líneas)
    const heading = l.head || HEADS.test(n) || (isCaps(t) && t.length <= 60 && t.split(/\s+/).length <= 7 && /[A-Z]{3}/.test(t)) || (l.size >= med * 1.25 && t.length < 90);
    if (heading) {
      if (STOP_HEADS.test(n)) break;
      flush(); out.push('## ' + t.replace(/:$/, '')); continue;
    }
    if (/^[•●▪◦○■□·\-–]\s*/.test(t)) { flush(); para = '• ' + t.replace(/^[•●▪◦○■□·\-–]\s*/, ''); continue; }
    if (para && /[a-záéíóúñ]-$/i.test(para) && /^[a-záéíóúñ]/.test(t)) para = para.slice(0, -1) + t;
    else para += (para ? ' ' : '') + t;
    if (/[.:;!?]$/.test(t) && t.length < 60) flush();
  }
  flush();
  return out.join('\n');
}
function detectSource(text, fileName = '') {
  const n = norm(String(text).slice(0, 30000) + ' ' + fileName);
  if (/statdx|stat dx|amirsys/.test(n) || (/key facts/.test(n) && /(diagnostic checklist|top differential)/.test(n))) return 'STATdx';
  if (/radiopaedia/.test(n)) return 'Radiopaedia';
  if (/(^|\s)10\.\d{4,9}\/\S+/.test(String(text)) || /(^|\n)## (abstract|resumen)/i.test(text) || /radiographics|american journal of roentgenology|european radiology|skeletal radiology|insights into imaging|neuroradiology|pediatric radiology|journal of/.test(n)) return 'Paper';
  return 'Otro';
}
const doiOf = text => { const m = String(text).match(/\b(10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;)])/); return m ? m[1] : ''; };
/** Resumen extractivo: Key facts (STATdx), abstract o puntos clave (paper), primer bloque y hallazgos (Radiopaedia). */
function summaryOf(md, fuente) {
  const lines = md.split('\n');
  const sec = re => {
    const i = lines.findIndex(l => l.startsWith('## ') && re.test(norm(l.slice(3))));
    if (i < 0) return '';
    const out = [lines[i]];
    for (let k = i + 1; k < lines.length && !(lines[k].startsWith('## ') && HEADS.test(norm(lines[k].slice(3))) && !/terminology|imaging|top differential|pathology|clinical issues|diagnostic checklist/.test(norm(lines[k].slice(3)))); k++) out.push(lines[k]);
    return out.join('\n');
  };
  let s = '';
  if (fuente === 'STATdx') {
    const i = lines.findIndex(l => /^## key facts/i.test(l));
    if (i >= 0) {
      const seen = new Set(), out = [];
      for (let k = i + 1; k < lines.length; k++) {
        const l = lines[k];
        if (l.startsWith('## ')) { const h = norm(l.slice(3)); if (seen.has(h)) break; seen.add(h); }
        out.push(l);
      }
      s = out.join('\n');
    }
  } else if (fuente === 'Paper') {
    s = [sec(/^(abstract|resumen)$/), sec(/^(teaching points|key points|essentials|summary|puntos clave)$/)].filter(Boolean).join('\n');
  } else if (fuente === 'Radiopaedia') {
    const first = []; for (const l of lines) { if (l.startsWith('## ')) break; first.push(l); }
    s = [first.join('\n'), sec(/^radiographic features/)].filter(Boolean).join('\n');
  }
  if (!s.trim()) s = lines.slice(0, 40).join('\n');
  return s.length > 9000 ? s.slice(0, 9000).replace(/\s+\S*$/, '') + ' …' : s;
}

/** Lee cualquier material y devuelve { md, resumen, titulo, fuente, doi, figures }. */
async function readMaterial(files, progress = () => {}) {
  const figures = []; let lines = [], textOnly = '';
  const names = files.map(f => f.name).join(' ');
  for (const file of files) {
    const n = file.name.toLowerCase();
    if (n.endsWith('.pdf')) { const r = await readPdfMaterial(await file.arrayBuffer(), progress); lines = lines.concat(r.lines); figures.push(...r.figures); }
    else if (n.endsWith('.docx')) { progress('Leyendo el documento…'); const r = await readDocxMaterial(await file.arrayBuffer()); lines = lines.concat(r.lines); figures.push(...r.figures); }
    else if (file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/.test(n)) { progress('Preparando imágenes…'); figures.push(await figureFromImage(file)); }
    else if (/\.(html?|xhtml)$/.test(n)) { const t = htmlLines(await file.text()); lines = lines.concat(t.map(x => ({ text: x, size: 11, page: 1 }))); }
    else if (/\.(txt|md|markdown)$/.test(n) || file.type.startsWith('text/')) textOnly += '\n' + (await file.text());
    else throw new Error(`No puedo leer «${file.name}». Usa PDF, Word (.docx), imágenes, HTML o texto.`);
  }
  if (textOnly.trim()) lines = lines.concat(textOnly.split(/\r?\n/).filter(t => t.trim()).map(t => ({ text: t.replace(/^#+\s*/, ''), size: /^#+\s/.test(t) ? 16 : 11, page: 1, head: /^#+\s/.test(t) })));
  lines = cleanLines(lines);
  const titulo = titleOf(lines);
  const md = linesToMd(lines, titulo);
  const fuente = detectSource(lines.map(l => l.text).join('\n') + '\n' + md, names);
  return { md, resumen: summaryOf(md, fuente), titulo, fuente, doi: doiOf(lines.map(l => l.text).join(' ')), figures };
}

/** Markdown simple → elementos DOM (sin innerHTML). */
function mdToDom(md) {
  const frag = document.createDocumentFragment();
  let ul = null;
  for (const line of String(md || '').split('\n')) {
    if (!line.trim()) { ul = null; continue; }
    if (line.startsWith('## ')) { ul = null; const e = document.createElement('h3'); e.textContent = line.slice(3); frag.append(e); continue; }
    if (line.startsWith('• ')) { if (!ul) { ul = document.createElement('ul'); frag.append(ul); } const li = document.createElement('li'); li.textContent = line.slice(2); ul.append(li); continue; }
    ul = null; const p = document.createElement('p'); p.textContent = line; frag.append(p);
  }
  return frag;
}
