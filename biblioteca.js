'use strict';
/* =====================================================================
   Biblioteca (imágenes de literatura y enfermedades por fuente) y
   página de cada tema del temario (casos + literatura).
   Colecciones: lit (material importado), img (figura con leyenda y
   miniatura; la imagen completa va como blob cifrado), nota (texto de
   una enfermedad según una fuente).
   ===================================================================== */

const FUENTES = ['STATdx', 'Radiopaedia', 'Paper', 'Libro', 'Clase', 'Otro'];
const enfKey = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
const fuenteLabel = x => (x.fuente === 'Paper' || x.fuente === 'Libro' || x.fuente === 'Otro') && x.fuenteNombre ? `${x.fuente}: ${x.fuenteNombre}` : (x.fuente || 'Sin fuente');

/* ---------- Clasificación efectiva de la literatura ---------- */
const _leff = new Map();
function litEff(x) {
  const key = `${x.updatedAt}|${TEM_V}`;
  const c = _leff.get(x.id); if (c && c.key === key) return c.v;
  const txt = enToEs([x.enfermedad, x.caption].filter(Boolean).join('. '));
  const cls = (!x.organo || !x.subtema) ? classifyText(x.especialidad, txt) : { organo: '', subtema: '' };
  const organo = x.organo || cls.organo || '', subtema = x.subtema || cls.subtema || '';
  let tema = x.temaId ? S.tem.get(x.temaId) : null;
  if (tema && tema.deleted) tema = null;
  if (!tema) { const m = matchTema(x.especialidad, enToEs(x.enfermedad || '') + ' ' + txt, organo, subtema); tema = m ? m.tema : null; }
  const v = { organo, subtema, tema, temaAuto: !x.temaId };
  _leff.set(x.id, { key, v });
  return v;
}
let _lcov = null;
function litCoverage() {
  const key = `${TEM_V}|${LIT_V}`;
  if (_lcov && _lcov.key === key) return _lcov.m;
  const m = new Map();
  const add = (id, k, x) => { if (!m.has(id)) m.set(id, { imgs: [], notas: [] }); m.get(id)[k].push(x); };
  for (const x of live(S.img)) { const e = litEff(x); if (e.tema) add(e.tema.id, 'imgs', x); }
  for (const x of live(S.nota)) { const e = litEff(x); if (e.tema) add(e.tema.id, 'notas', x); }
  _lcov = { key, m };
  return m;
}
function diseases() {
  const map = new Map();
  const get = x => {
    const k = enfKey(x.enfermedad) || '(sin nombre)';
    if (!map.has(k)) map.set(k, { key: k, names: {}, notas: [], imgs: [], esp: {} });
    const d = map.get(k);
    d.names[x.enfermedad || 'Sin nombre'] = (d.names[x.enfermedad || 'Sin nombre'] || 0) + 1;
    if (x.especialidad) d.esp[x.especialidad] = (d.esp[x.especialidad] || 0) + 1;
    return d;
  };
  for (const x of live(S.nota)) get(x).notas.push(x);
  for (const x of live(S.img)) get(x).imgs.push(x);
  for (const d of map.values()) {
    d.name = Object.entries(d.names).sort((a, b) => b[1] - a[1])[0][0];
    d.especialidad = Object.entries(d.esp).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }
  return map;
}

/* ---------- Miniaturas y visor ---------- */
function thumbEl(x, list, i) {
  const img = h('img', { src: x.thumb || '', alt: x.caption || x.enfermedad || 'Imagen', loading: 'lazy' });
  return h('button', { type: 'button', class: 'thumb', onclick: () => openViewer(list, i), title: x.caption || '' }, img,
    x.caption ? h('span', { class: 'tcap' }, x.caption) : null);
}
function gallery(list) { return h('div', { class: 'gallery' }, ...list.map((x, i) => thumbEl(x, list, i))); }
async function openViewer(list, i) {
  const d = $('#viewer');
  let k = i;
  const img = h('img', { alt: '' }), cap = h('p', { class: 'vcap' }), meta = h('p', { class: 'vmeta' }), stat = h('p', { class: 'hint' });
  const show = async () => {
    const x = S.img.get(list[k].id) || list[k];
    img.src = x.thumb || ''; img.alt = x.caption || x.enfermedad || '';
    cap.textContent = x.caption || 'Sin leyenda';
    const e = litEff(x);
    meta.textContent = [x.enfermedad, fuenteLabel(x), x.especialidad, e.organo, e.subtema, e.tema ? `Tema: ${e.tema.tema}` : ''].filter(Boolean).join(' · ');
    count.textContent = `${k + 1} de ${list.length}`;
    stat.textContent = '';
    try {
      const u = await blobUrl(x.blob);
      if (u && list[k] && (list[k].id === x.id)) img.src = u;
      else if (!u) stat.textContent = 'Mostrando la miniatura: la imagen completa se descarga cuando hay conexión.';
    } catch { stat.textContent = 'No se pudo abrir la imagen completa.'; }
  };
  const count = h('span', { class: 'vcount' });
  const go = s => { k = (k + s + list.length) % list.length; show(); };
  let x0 = null;
  img.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
  d.replaceChildren(h('div', { class: 'vwrap' },
    h('div', { class: 'vbar' },
      h('button', { type: 'button', class: 'link', onclick: () => d.close() }, 'Cerrar'), count,
      h('span', {},
        h('button', { type: 'button', class: 'link', onclick: () => { d.close(); openImgEdit(list[k].id, () => openViewer(list.map(y => S.img.get(y.id) || y).filter(y => !y.deleted), Math.min(k, list.length - 1))); } }, 'Editar'))),
    h('div', { class: 'vimg' }, img),
    list.length > 1 ? h('div', { class: 'vnav' },
      h('button', { type: 'button', class: 'btn', onclick: () => go(-1) }, 'Anterior'),
      h('button', { type: 'button', class: 'btn', onclick: () => go(1) }, 'Siguiente')) : null,
    cap, meta, stat));
  d.onkeydown = e => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  d.showModal();
  show();
}

/* ---------- Página de un tema: todo lo asociado ---------- */
function renderTopicPage(id) {
  const t = S.tem.get(id), box = $('#t-page');
  const cc = temCls(t), cases = coverage().get(id) || [], lc = litCoverage().get(id) || { imgs: [], notas: [] };
  const byDis = new Map();
  for (const n of lc.notas) { const k = enfKey(n.enfermedad); if (!byDis.has(k)) byDis.set(k, []); byDis.get(k).push(n); }
  $('#title').textContent = 'Tema';
  box.replaceChildren(h('div', { class: 'page', style: { '--esp': espColor(t.especialidad) } },
    h('button', { type: 'button', class: 'link back', onclick: () => { S.topicPage = null; $('#title').textContent = TAB_TITLES.tem; renderTem(); } }, '‹ Temario'),
    h('h2', { class: 'ptitle' }, t.tema),
    h('p', { class: 'muted' }, [t.especialidad, t.mes ? 'Mes ' + t.mes : 'Sin mes', cc.organo, cc.subtema].filter(Boolean).join(' · ')),
    h('div', { class: 'btnrow tight' },
      cases.length ? h('button', { type: 'button', class: 'btn primary sm', onclick: () => { showTab('prac'); startPractice(cases); } }, `Practicar ${cases.length} caso${cases.length > 1 ? 's' : ''}`) : null,
      h('button', { type: 'button', class: 'btn sm', onclick: () => openTopic(id) }, 'Editar tema'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => openMaterialPicker({ esp: t.especialidad, temaId: id }) }, 'Agregar literatura'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => openPackDialog({ title: t.tema, esps: [t.especialidad], temaIds: [id] }) }, 'Exportar paquete')),
    h('h3', { class: 'psech' }, `Casos (${cases.length})`),
    cases.length ? h('ol', { class: 'list' }, ...cases.sort((a, b) => byFecha(-1)(a.x, b.x)).map(c => h('li', { class: 'row trow', style: { '--esp': espColor(c.x.especialidad) } },
      h('button', { type: 'button', class: 'rbody', onclick: () => (c.col === 'casos' ? openCaseDetail(c.id) : openResDetail(c.id)) },
        h('div', { class: 'l1' }, h('span', { class: 'date' }, c.x.fecha ? isoToDisp(c.x.fecha) : 'Sin fecha'), h('span', { class: 'rut' + (c.x.rut ? '' : ' none') }, c.x.rut || 'Sin RUT'),
          h('span', { class: 'tipo' }, c.col === 'casos' ? 'Mío' : (c.x.residente || 'Residente'))),
        h('div', { class: 'dx' }, c.x.diagnostico || 'Sin diagnóstico'))))) : h('p', { class: 'empty-state sm' }, 'Aún no hay casos para este tema.'),
    h('h3', { class: 'psech' }, `Imágenes de literatura (${lc.imgs.length})`),
    lc.imgs.length ? gallery(lc.imgs) : h('p', { class: 'empty-state sm' }, 'Sin imágenes. Agrega un PDF de STATdx, Radiopaedia o un paper en Biblioteca.'),
    h('h3', { class: 'psech' }, `Enfermedades y fuentes (${lc.notas.length})`),
    byDis.size ? h('ol', { class: 'list' }, ...[...byDis.entries()].map(([k, ns]) => h('li', { class: 'row trow' },
      h('button', { type: 'button', class: 'rbody', onclick: () => { S.bibPage = k; showTab('bib'); } },
        h('div', { class: 'dx' }, ns[0].enfermedad || 'Sin nombre'),
        h('div', { class: 'meta' }, ns.map(fuenteLabel).join(' · ')))))) : h('p', { class: 'empty-state sm' }, 'Sin textos de enfermedades para este tema.')));
}

/* ---------- Biblioteca ---------- */
S.fb = { mode: 'enf', esp: '', q: '', organo: '', subtema: '', fuente: '' };
function renderBib() {
  if (S.bibPage) { $('#b-main').hidden = true; $('#b-page').hidden = false; return renderDisease(S.bibPage); }
  $('#b-main').hidden = false; $('#b-page').hidden = true; $('#title').textContent = TAB_TITLES.bib;
  refreshChoice($('#b-mode'));
  const f = S.fb, src = f.mode === 'img' ? live(S.img) : live(S.nota);
  renderEspBar($('#b-esp'), f, src, renderBib);
  const base = src.filter(x => espOk(f.esp, x.especialidad));
  const E = new Map(base.map(x => [x.id, litEff(x)]));
  const ev = [...E.values()];
  f.organo = fillSelect($('#b-org'), 'Órganos', orderedVals(ev.map(e => e.organo), taxOrder(f.esp, 'o')), f.organo);
  f.subtema = fillSelect($('#b-sub'), 'Subtemas', orderedVals(ev.map(e => e.subtema), taxOrder(f.esp, 's')), f.subtema);
  f.fuente = fillSelect($('#b-fuente'), 'Fuentes', [...new Set(base.map(x => x.fuente).filter(Boolean))].sort((a, b) => FUENTES.indexOf(a) - FUENTES.indexOf(b)), f.fuente);
  const terms = norm(f.q).split(/\s+/).filter(Boolean);
  const list = base.filter(x => {
    const e = E.get(x.id);
    if (f.organo && e.organo !== f.organo) return false;
    if (f.subtema && e.subtema !== f.subtema) return false;
    if (f.fuente && x.fuente !== f.fuente) return false;
    if (!terms.length) return true;
    const H = norm([x.enfermedad, x.caption, x.fuente, x.fuenteNombre, x.resumen, x.especialidad, e.organo, e.subtema, e.tema && e.tema.tema].filter(Boolean).join(' ') + ' ' + enToEs([x.caption, x.resumen].filter(Boolean).join(' ')));
    return terms.every(t => H.includes(t));
  });
  const box = $('#b-list');
  if (f.mode === 'img') {
    $('#b-count').textContent = list.length ? `${list.length} ${list.length > 1 ? 'imágenes' : 'imagen'}` : '';
    if (!list.length) { box.replaceChildren(h('p', { class: 'empty-state' }, src.length ? 'Ninguna imagen coincide con estos filtros.' : 'Agrega material (PDF de STATdx, Radiopaedia, un paper o capturas) para separar sus imágenes con la leyenda.')); return; }
    const groups = new Map();
    for (const x of list) { const k = enfKey(x.enfermedad); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
    box.replaceChildren(...[...groups.entries()].sort((a, b) => (a[1][0].enfermedad || '').localeCompare(b[1][0].enfermedad || '', 'es')).map(([k, xs]) => h('section', { class: 'grp' },
      h('h3', {}, h('button', { type: 'button', class: 'link', onclick: () => { S.bibPage = k; renderBib(); window.scrollTo(0, 0); } }, xs[0].enfermedad || 'Sin nombre'),
        h('span', { class: 'cnt' }, ` ${[...new Set(xs.map(x => x.fuente))].join(', ')}`)),
      gallery(xs.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))))));
  } else {
    const dis = diseases(), keys = new Set(list.map(x => enfKey(x.enfermedad) || '(sin nombre)'));
    if (!terms.length && !f.organo && !f.subtema && !f.fuente) for (const x of live(S.img)) if (espOk(f.esp, x.especialidad)) keys.add(enfKey(x.enfermedad) || '(sin nombre)');
    const arr = [...keys].map(k => dis.get(k)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    $('#b-count').textContent = arr.length ? `${arr.length} enfermedad${arr.length > 1 ? 'es' : ''}` : '';
    if (!arr.length) { box.replaceChildren(h('p', { class: 'empty-state' }, src.length || S.img.size ? 'Ninguna enfermedad coincide con estos filtros.' : 'Aquí se guarda lo que subas de cada enfermedad, separado por fuente: STATdx, Radiopaedia, cada paper con su nombre…')); return; }
    box.replaceChildren(h('ol', { class: 'list' }, ...arr.map(d => {
      const e = d.notas[0] ? litEff(d.notas[0]) : (d.imgs[0] ? litEff(d.imgs[0]) : {});
      return h('li', { class: 'row trow', style: { '--esp': espColor(d.especialidad) } },
        h('button', { type: 'button', class: 'rbody', onclick: () => { S.bibPage = d.key; renderBib(); window.scrollTo(0, 0); } },
          h('div', { class: 'dx' }, d.name),
          h('div', { class: 'meta' }, [d.especialidad, e.organo, e.subtema].filter(Boolean).join(', '), ' ',
            ...d.notas.map(n => h('span', { class: 'badge lit' }, n.fuente === 'Paper' ? 'Paper' : n.fuente)),
            d.imgs.length ? h('span', { class: 'badge' }, `${d.imgs.length} img`) : null)));
    })));
  }
}

/* ---------- Página de una enfermedad: una pestaña por fuente ---------- */
function renderDisease(key) {
  const d = diseases().get(key), box = $('#b-page');
  if (!d) { S.bibPage = null; return renderBib(); }
  $('#title').textContent = 'Enfermedad';
  const notas = d.notas.sort((a, b) => FUENTES.indexOf(a.fuente) - FUENTES.indexOf(b.fuente) || (a.createdAt || 0) - (b.createdAt || 0));
  if (!S.bibSrc || !notas.some(n => n.id === S.bibSrc)) S.bibSrc = notas[0] ? notas[0].id : null;
  const seg = h('div', { class: 'seg srcseg' });
  if (notas.length) buildChoice(seg, notas.map(n => ({ value: n.id, label: n.fuente === 'Paper' && n.fuenteNombre ? n.fuenteNombre.slice(0, 28) + (n.fuenteNombre.length > 28 ? '…' : '') : n.fuente })), () => S.bibSrc, v => { S.bibSrc = v; renderDisease(key); }, { seg: true });
  const n = notas.find(x => x.id === S.bibSrc);
  const e = n ? litEff(n) : d.imgs[0] ? litEff(d.imgs[0]) : {};
  const full = h('div', { class: 'md full', hidden: '' });
  const content = n ? h('div', { class: 'srcbox' },
    h('p', { class: 'muted' }, fuenteLabel(n), n.doi ? [' · ', h('a', { href: 'https://doi.org/' + n.doi, target: '_blank', rel: 'noopener noreferrer' }, 'DOI')] : null),
    h('div', { class: 'md' }, mdToDom(n.resumen || '')),
    (n.texto || n.textoBlob) ? h('button', { type: 'button', class: 'link', onclick: async ev => {
      if (!full.hidden) { full.hidden = true; ev.currentTarget.textContent = 'Ver texto completo'; return; }
      let t = n.texto;
      if (!t && n.textoBlob) { ev.currentTarget.textContent = 'Cargando…'; try { t = await blobText(n.textoBlob); } catch { t = null; } }
      full.replaceChildren(t ? mdToDom(t) : h('p', { class: 'warn' }, 'No se pudo cargar el texto (sin conexión o aún no sincronizado).'));
      full.hidden = false; ev.currentTarget.textContent = 'Ocultar texto completo';
    } }, 'Ver texto completo') : null, full,
    h('div', { class: 'btnrow tight' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => openNotaEdit(n.id) }, 'Editar'),
      h('button', { type: 'button', class: 'btn sm danger', onclick: () => deleteNota(n.id) }, 'Eliminar esta fuente'))) : null;
  box.replaceChildren(h('div', { class: 'page', style: { '--esp': espColor(d.especialidad) } },
    h('button', { type: 'button', class: 'link back', onclick: () => { S.bibPage = null; renderBib(); } }, '‹ Biblioteca'),
    h('h2', { class: 'ptitle' }, d.name),
    h('p', { class: 'muted' }, [d.especialidad, e.organo, e.subtema].filter(Boolean).join(' · '),
      e.tema ? [' · Tema: ', h('button', { type: 'button', class: 'link inline', onclick: () => { S.topicPage = e.tema.id; showTab('tem'); } }, e.tema.tema)] : null),
    h('div', { class: 'btnrow tight' }, h('button', { type: 'button', class: 'btn sm', onclick: () => openMaterialPicker({ enfermedad: d.name, esp: d.especialidad }) }, 'Agregar fuente o imágenes')),
    notas.length ? [seg, content] : h('p', { class: 'empty-state sm' }, 'Sin textos guardados para esta enfermedad.'),
    h('h3', { class: 'psech' }, `Imágenes (${d.imgs.length})`),
    d.imgs.length ? gallery(d.imgs.sort((a, b) => (a.litId || '').localeCompare(b.litId || '') || (a.orden ?? 0) - (b.orden ?? 0))) : h('p', { class: 'empty-state sm' }, 'Sin imágenes.')));
}

/* ---------- Agregar material ---------- */
let _matPreset = {};
function openMaterialPicker(preset = {}) { _matPreset = preset; $('#b-file').click(); }
async function onMaterialFiles(files, preset = {}) {
  if (!files.length) return;
  try {
    toast('Leyendo el material…');
    const r = await readMaterial(files, msg => toast(msg));
    if (!r.md.trim() && !r.figures.length) throw new Error('No encontré texto ni imágenes en el archivo.');
    openMaterialDialog(r, files.map(f => f.name).join(', '), preset);
  } catch (e) { toast(e.message, true); }
  finally { $('#b-file').value = ''; _matPreset = {}; }
}
function openMaterialPaste(preset = {}) {
  const d = $('#impDlg');
  const ta = h('textarea', { rows: '12', 'aria-label': 'Texto', placeholder: 'Pega un resumen o un artículo. Los títulos pueden ir como «## Hallazgos».' });
  d.replaceChildren(h('div', { class: 'dlg' }, h('h2', {}, 'Pegar texto de una enfermedad'), ta,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => {
        if (!ta.value.trim()) { toast('Pega el texto', true); return; }
        const r = await readMaterial([new File([ta.value], 'texto.md', { type: 'text/plain' })]);
        openMaterialDialog(r, 'Texto pegado', preset);
      } }, 'Revisar'))));
  d.showModal(); setTimeout(() => ta.focus(), 50);
}
function guessEsp(text, key = text) {
  // 1) la especialidad cuyo temario tiene el tema más parecido; 2) la de más palabras clave de órgano
  let best = '', bs = 0;
  for (const e of ESPECIALIDADES) {
    const c = classifyText(e, key), m = matchTema(e, key, c.organo, c.subtema);
    if (m && m.score > bs) { bs = m.score; best = e; }
  }
  if (best) return best;
  for (const e of ESPECIALIDADES) { const sc = espScore(e, text); if (sc > bs) { bs = sc; best = e; } }
  return bs >= 8 ? best : '';
}
function openMaterialDialog(r, fileName, preset = {}) {
  const d = $('#impDlg');
  const sample = enToEs([r.titulo, r.md.slice(0, 5000), r.figures.map(f => f.caption).join(' ')].join(' '));
  const key = enToEs([preset.enfermedad, r.titulo].filter(Boolean).join('. '));
  const M = {
    enfermedad: preset.enfermedad || (r.fuente === 'Paper' ? '' : r.titulo) || '',
    fuente: r.fuente, fuenteNombre: r.fuente === 'Paper' || r.fuente === 'Otro' ? r.titulo : '',
    esp: preset.esp || guessEsp(sample, key) || (S.fb.esp && S.fb.esp !== NONE ? S.fb.esp : ''),
    organo: '', subtema: '', temaId: preset.temaId || '',
    saveText: !!r.md.trim(), keep: r.figures.map(() => true), caps: r.figures.map(f => f.caption || '')
  };
  const enf = h('input', { type: 'text', list: 'dl-enf', 'aria-label': 'Enfermedad', placeholder: 'p. ej. Hemangioma hepático' }); enf.value = M.enfermedad;
  const dl = h('datalist', { id: 'dl-enf' }, ...[...diseases().values()].map(x => h('option', { value: x.name })));
  const fte = h('select', { 'aria-label': 'Fuente' }, ...FUENTES.map(f => h('option', { value: f }, f))); fte.value = FUENTES.includes(M.fuente) ? M.fuente : 'Otro';
  const fnom = h('input', { type: 'text', 'aria-label': 'Nombre de la fuente', placeholder: 'Título del paper, libro o clase' }); fnom.value = M.fuenteNombre;
  const esp = h('select', { 'aria-label': 'Especialidad' }, h('option', { value: '' }, 'Elige…'), ...ESPECIALIDADES.map(e => h('option', { value: e }, e))); esp.value = M.esp;
  const org = h('select', { 'aria-label': 'Órgano' }), sub = h('select', { 'aria-label': 'Subtema' }), tem = h('select', { 'aria-label': 'Tema del temario' });
  const resumen = h('textarea', { rows: '8', 'aria-label': 'Resumen' }); resumen.value = r.resumen || '';
  const fill = () => {
    const txt = enToEs(`${enf.value}. ${r.titulo}`), c = classifyText(esp.value, txt);
    org.replaceChildren(h('option', { value: '' }, `Automático${c.organo ? ': ' + c.organo : ''}`), ...organosDe(esp.value).map(o => h('option', { value: o }, o)));
    sub.replaceChildren(h('option', { value: '' }, `Automático${c.subtema ? ': ' + c.subtema : ''}`), ...subtemasDe(esp.value).map(o => h('option', { value: o }, o)));
    org.value = organosDe(esp.value).includes(M.organo) ? M.organo : ''; sub.value = subtemasDe(esp.value).includes(M.subtema) ? M.subtema : '';
    const m = matchTema(esp.value, txt, M.organo || c.organo, M.subtema || c.subtema);
    const topics = live(S.tem).filter(t => t.especialidad === esp.value).sort(temSort);
    tem.replaceChildren(h('option', { value: '' }, m ? `Automático: ${m.tema.tema.slice(0, 60)}` : topics.length ? 'Automático (sin coincidencia)' : 'Automático (no hay temario de esta especialidad)'),
      ...topics.map(t => h('option', { value: t.id }, `${t.mes ? 'Mes ' + t.mes + ' · ' : ''}${t.tema.slice(0, 70)}`)));
    tem.value = topics.some(t => t.id === M.temaId) ? M.temaId : '';
  };
  fill();
  esp.addEventListener('change', () => { M.esp = esp.value; M.organo = ''; M.subtema = ''; M.temaId = ''; fill(); });
  enf.addEventListener('input', debounce(fill, 300));
  org.addEventListener('change', () => { M.organo = org.value; fill(); });
  sub.addEventListener('change', () => { M.subtema = sub.value; fill(); });
  tem.addEventListener('change', () => { M.temaId = tem.value; });
  const st = h('input', { type: 'checkbox' }); st.checked = M.saveText; st.addEventListener('change', () => { M.saveText = st.checked; resumen.disabled = !st.checked; });
  const figs = r.figures.map((f, i) => {
    const cb = h('input', { type: 'checkbox', 'aria-label': `Guardar imagen ${i + 1}` }); cb.checked = true; cb.addEventListener('change', () => { M.keep[i] = cb.checked; upd(); });
    const cap = h('textarea', { rows: '3', 'aria-label': `Leyenda de la imagen ${i + 1}`, placeholder: 'Leyenda o descripción' }); cap.value = M.caps[i];
    cap.addEventListener('input', () => { M.caps[i] = cap.value; });
    return h('div', { class: 'figedit' }, h('label', { class: 'figimg' }, cb, h('img', { src: f.thumb, alt: '' })), cap);
  });
  const saveBtn = h('button', { type: 'button', class: 'btn primary', onclick: () => saveMaterial(r, fileName, M, { enf, fte, fnom, esp, resumen }, saveBtn) });
  const upd = () => { const n = M.keep.filter(Boolean).length; saveBtn.textContent = `Guardar${M.saveText ? ' texto' : ''}${n ? `${M.saveText ? ' y' : ''} ${n} ${n > 1 ? 'imágenes' : 'imagen'}` : ''}`; };
  st.addEventListener('change', upd); upd();
  d.replaceChildren(h('div', { class: 'dlg' },
    h('h2', {}, 'Revisar material'),
    h('p', { class: 'muted' }, `${fileName}: ${r.fuente !== 'Otro' ? `parece ${r.fuente}. ` : ''}${r.figures.length} ${r.figures.length === 1 ? 'imagen' : 'imágenes'} con leyenda${r.md ? `, ${r.md.length.toLocaleString('es-CL')} caracteres de texto` : ''}.`),
    h('div', { class: 'formgrid' },
      h('label', { class: 'lbl' }, 'Enfermedad'), enf, dl,
      h('label', { class: 'lbl' }, 'Fuente'), fte,
      h('label', { class: 'lbl' }, 'Nombre de la fuente'), fnom,
      h('label', { class: 'lbl' }, 'Especialidad'), esp,
      h('label', { class: 'lbl' }, 'Órgano'), org,
      h('label', { class: 'lbl' }, 'Subtema'), sub,
      h('label', { class: 'lbl' }, 'Tema del temario'), tem),
    r.md.trim() ? h('fieldset', { class: 'radios' }, h('legend', {}, 'Texto'),
      h('label', { class: 'check' }, st, ' Guardar el texto en Enfermedades, bajo esta fuente'),
      h('span', { class: 'hint' }, 'Resumen (editable). El texto completo también se guarda y se abre con «Ver texto completo».'), resumen) : null,
    figs.length ? h('fieldset', { class: 'radios' }, h('legend', {}, `Imágenes (${figs.length})`), h('span', { class: 'hint' }, 'Desmarca las que no sirvan (logos, tablas) y corrige las leyendas si hace falta.'), ...figs) : null,
    h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'), saveBtn)));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
async function saveMaterial(r, fileName, M, el, btn) {
  const enfermedad = el.enf.value.replace(/\s+/g, ' ').trim(), especialidad = el.esp.value;
  if (!enfermedad) { toast('Escribe el nombre de la enfermedad', true); el.enf.focus(); return; }
  if (!especialidad) { toast('Elige la especialidad', true); return; }
  const kept = r.figures.map((f, i) => ({ f, i })).filter(({ i }) => M.keep[i]);
  if (!M.saveText && !kept.length) { toast('No hay nada marcado para guardar', true); return; }
  const common = { enfermedad, especialidad, organo: M.organo, subtema: M.subtema, temaId: M.temaId, fuente: el.fte.value, fuenteNombre: el.fnom.value.trim() };
  busy(btn, true, 'Cifrando…');
  try {
    const litId = 'l_' + crypto.randomUUID();
    const imgs = [];
    for (const { f, i } of kept) {
      const blob = 'b_' + crypto.randomUUID();
      await putBlob(blob, f.full, 'image/jpeg');
      imgs.push({ id: 'i_' + crypto.randomUUID(), litId, orden: i, caption: M.caps[i].replace(/\s+/g, ' ').trim(), thumb: f.thumb, blob, w: f.w, h: f.h, ...common, deleted: false });
    }
    let nota = null;
    if (M.saveText && r.md.trim()) {
      nota = { id: 'n_' + crypto.randomUUID(), litId, ...common, doi: r.doi || '', resumen: el.resumen.value.trim().slice(0, 12000), texto: '', textoBlob: '', deleted: false };
      if (r.md.length > 26000) { nota.textoBlob = 'b_' + crypto.randomUUID(); await putBlob(nota.textoBlob, TE.encode(r.md), 'text/plain'); }
      else nota.texto = r.md;
    }
    await saveRecord('lit', { id: litId, titulo: r.titulo, archivo: fileName, doi: r.doi || '', nImgs: imgs.length, ...common, deleted: false });
    if (imgs.length) await saveMany('img', imgs);
    if (nota) await saveRecord('nota', nota);
  } catch (e) { toast('No se pudo guardar: ' + e.message, true); return; }
  finally { busy(btn, false); }
  $('#impDlg').close();
  S.bibPage = enfKey(enfermedad); S.bibSrc = null;
  if (S.tab !== 'bib') showTab('bib'); else renderBib();
  toast('Material guardado');
}

/* ---------- Editar y eliminar ---------- */
function classSelects(espV, orgV, subV, temV, text) {
  const esp = h('select', { 'aria-label': 'Especialidad' }, ...ESPECIALIDADES.map(e => h('option', { value: e }, e))); esp.value = espV || ESPECIALIDADES[0];
  const org = h('select', { 'aria-label': 'Órgano' }), sub = h('select', { 'aria-label': 'Subtema' }), tem = h('select', { 'aria-label': 'Tema del temario' });
  const fill = () => {
    const c = classifyText(esp.value, enToEs(text()));
    org.replaceChildren(h('option', { value: '' }, `Automático${c.organo ? ': ' + c.organo : ''}`), ...organosDe(esp.value).map(o => h('option', { value: o }, o)));
    sub.replaceChildren(h('option', { value: '' }, `Automático${c.subtema ? ': ' + c.subtema : ''}`), ...subtemasDe(esp.value).map(o => h('option', { value: o }, o)));
    const topics = live(S.tem).filter(t => t.especialidad === esp.value).sort(temSort);
    tem.replaceChildren(h('option', { value: '' }, 'Automático'), ...topics.map(t => h('option', { value: t.id }, `${t.mes ? 'Mes ' + t.mes + ' · ' : ''}${t.tema.slice(0, 70)}`)));
    org.value = orgV && organosDe(esp.value).includes(orgV) ? orgV : ''; sub.value = subV && subtemasDe(esp.value).includes(subV) ? subV : '';
    tem.value = topics.some(t => t.id === temV) ? temV : '';
  };
  fill();
  esp.addEventListener('change', () => { orgV = subV = temV = ''; fill(); });
  org.addEventListener('change', () => { orgV = org.value; }); sub.addEventListener('change', () => { subV = sub.value; }); tem.addEventListener('change', () => { temV = tem.value; });
  return { esp, org, sub, tem, refill: fill };
}
function openImgEdit(id, onDone) {
  const x = S.img.get(id); if (!x) return;
  const d = $('#detail');
  const cap = h('textarea', { rows: '4', 'aria-label': 'Leyenda' }); cap.value = x.caption || '';
  const enf = h('input', { type: 'text', 'aria-label': 'Enfermedad', list: 'dl-enf2' }); enf.value = x.enfermedad || '';
  const dl = h('datalist', { id: 'dl-enf2' }, ...[...diseases().values()].map(v => h('option', { value: v.name })));
  const cs = classSelects(x.especialidad, x.organo, x.subtema, x.temaId, () => `${enf.value}. ${cap.value}`);
  d.replaceChildren(h('div', { class: 'dlg' }, h('h2', {}, 'Editar imagen'),
    h('img', { class: 'editimg', src: x.thumb, alt: '' }),
    h('div', { class: 'formgrid' },
      h('label', { class: 'lbl' }, 'Leyenda'), cap, h('label', { class: 'lbl' }, 'Enfermedad'), enf, dl,
      h('label', { class: 'lbl' }, 'Especialidad'), cs.esp, h('label', { class: 'lbl' }, 'Órgano'), cs.org,
      h('label', { class: 'lbl' }, 'Subtema'), cs.sub, h('label', { class: 'lbl' }, 'Tema del temario'), cs.tem),
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn danger', onclick: async () => {
        if (!confirm('¿Eliminar esta imagen? Se eliminará en todos tus dispositivos.')) return;
        await saveRecord('img', { id, deleted: true }); await deleteBlobs([x.blob]); d.close(); renderLists(); toast('Imagen eliminada');
      } }, 'Eliminar'),
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => {
        const e = enf.value.replace(/\s+/g, ' ').trim(); if (!e) { toast('Escribe la enfermedad', true); return; }
        await saveRecord('img', { ...S.img.get(id), caption: cap.value.replace(/\s+/g, ' ').trim(), enfermedad: e, especialidad: cs.esp.value, organo: cs.org.value, subtema: cs.sub.value, temaId: cs.tem.value });
        d.close(); renderLists(); toast('Imagen guardada'); if (onDone) onDone();
      } }, 'Guardar'))));
  d.showModal();
}
function openNotaEdit(id) {
  const x = S.nota.get(id); if (!x) return;
  const d = $('#detail');
  const enf = h('input', { type: 'text', 'aria-label': 'Enfermedad', list: 'dl-enf3' }); enf.value = x.enfermedad || '';
  const dl = h('datalist', { id: 'dl-enf3' }, ...[...diseases().values()].map(v => h('option', { value: v.name })));
  const fte = h('select', { 'aria-label': 'Fuente' }, ...FUENTES.map(f => h('option', { value: f }, f))); fte.value = FUENTES.includes(x.fuente) ? x.fuente : 'Otro';
  const fnom = h('input', { type: 'text', 'aria-label': 'Nombre de la fuente' }); fnom.value = x.fuenteNombre || '';
  const res = h('textarea', { rows: '10', 'aria-label': 'Resumen' }); res.value = x.resumen || '';
  const cs = classSelects(x.especialidad, x.organo, x.subtema, x.temaId, () => enf.value);
  const also = h('input', { type: 'checkbox' }); also.checked = true;
  const hasImgs = live(S.img).some(i => i.litId && i.litId === x.litId);
  d.replaceChildren(h('div', { class: 'dlg' }, h('h2', {}, 'Editar fuente'),
    h('div', { class: 'formgrid' },
      h('label', { class: 'lbl' }, 'Enfermedad'), enf, dl, h('label', { class: 'lbl' }, 'Fuente'), fte, h('label', { class: 'lbl' }, 'Nombre de la fuente'), fnom,
      h('label', { class: 'lbl' }, 'Especialidad'), cs.esp, h('label', { class: 'lbl' }, 'Órgano'), cs.org, h('label', { class: 'lbl' }, 'Subtema'), cs.sub,
      h('label', { class: 'lbl' }, 'Tema del temario'), cs.tem, h('label', { class: 'lbl' }, 'Resumen'), res),
    hasImgs ? h('label', { class: 'check' }, also, ' Aplicar enfermedad, fuente y clasificación también a sus imágenes') : null,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => {
        const e = enf.value.replace(/\s+/g, ' ').trim(); if (!e) { toast('Escribe la enfermedad', true); return; }
        const common = { enfermedad: e, fuente: fte.value, fuenteNombre: fnom.value.trim(), especialidad: cs.esp.value, organo: cs.org.value, subtema: cs.sub.value, temaId: cs.tem.value };
        await saveRecord('nota', { ...S.nota.get(id), ...common, resumen: res.value.trim().slice(0, 12000) });
        if (hasImgs && also.checked) await saveMany('img', live(S.img).filter(i => i.litId === x.litId).map(i => ({ ...i, ...common })));
        d.close(); S.bibPage = enfKey(e); renderLists(); toast('Fuente guardada');
      } }, 'Guardar'))));
  d.showModal();
}
async function deleteNota(id) {
  const x = S.nota.get(id); if (!x) return;
  const imgs = live(S.img).filter(i => i.litId && i.litId === x.litId);
  const withImgs = imgs.length && confirm(`¿Eliminar también las ${imgs.length} imágenes que vinieron con esta fuente?\nAceptar: texto e imágenes. Cancelar: solo el texto.`);
  if (!confirm('¿Eliminar esta fuente? Se eliminará en todos tus dispositivos.')) return;
  await saveRecord('nota', { id, deleted: true });
  if (x.textoBlob) await deleteBlobs([x.textoBlob]);
  if (withImgs) { await saveMany('img', imgs.map(i => ({ id: i.id, deleted: true }))); await deleteBlobs(imgs.map(i => i.blob)); }
  S.bibSrc = null; renderLists(); toast('Fuente eliminada');
}

/* ---------- Eventos ---------- */
function bindBibEvents() {
  buildChoice($('#b-mode'), [{ value: 'enf', label: 'Enfermedades' }, { value: 'img', label: 'Imágenes' }], () => S.fb.mode, v => { S.fb.mode = v; S.fb.organo = S.fb.subtema = S.fb.fuente = ''; renderBib(); }, { seg: true });
  $('#b-file').addEventListener('change', e => onMaterialFiles([...e.target.files], _matPreset));
  $('#b-paste').addEventListener('click', () => openMaterialPaste());
  $('#b-q').addEventListener('input', debounce(e => { S.fb.q = e.target.value; renderBib(); }, 150));
  for (const [id, k] of [['#b-org', 'organo'], ['#b-sub', 'subtema'], ['#b-fuente', 'fuente']]) $(id).addEventListener('change', e => { S.fb[k] = e.target.value; renderBib(); });
}
