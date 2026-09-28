'use strict';
/* =====================================================================
   Estudio: práctica con repetición espaciada (FSRS), modo oral,
   plan de exámenes y paquete de estudio (JSON + TSV para Anki + imágenes).
   ===================================================================== */

/* ---------- FSRS 4.5 (parámetros por defecto, retención deseada 90 %) ---------- */
const FSRS_W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const F_DECAY = -0.5, F_FACTOR = 19 / 81, F_RET = 0.9, DAYMS = 864e5;
const clampD = d => Math.min(10, Math.max(1, d));
const fsrsR = (t, s) => Math.pow(1 + F_FACTOR * t / s, F_DECAY);
const fsrsIvl = s => Math.max(1, Math.min(365, Math.round(s / F_FACTOR * (Math.pow(F_RET, 1 / F_DECAY) - 1))));
/** st: estado previo {s, d, last} o null si es nuevo; g: 1 Otra vez · 2 Difícil · 3 Bien · 4 Fácil. */
function fsrsNext(st, g, now = Date.now()) {
  const w = FSRS_W;
  let s, d;
  if (!st || !st.s) { s = w[g - 1]; d = clampD(w[4] - (g - 3) * w[5]); }
  else {
    const t = Math.max(0, (now - (st.last ?? now)) / DAYMS), r = fsrsR(t, st.s);
    d = clampD(w[7] * clampD(w[4] - w[5]) + (1 - w[7]) * (st.d - w[6] * (g - 3)));
    if (g === 1) s = Math.min(st.s, w[11] * Math.pow(d, -w[12]) * (Math.pow(st.s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)));
    else s = st.s * (Math.exp(w[8]) * (11 - d) * Math.pow(st.s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * (g === 2 ? w[15] : 1) * (g === 4 ? w[16] : 1) + 1);
  }
  const ivl = g === 1 ? 1 : fsrsIvl(s);
  return { s, d, ivl, due: now + ivl * DAYMS };
}
const fmtIvl = d => (d <= 1 ? 'mañana' : d < 30 ? `${d} d` : d < 365 ? `${Math.round(d / 30)} m` : '1 año');
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const endOfToday = () => startOfToday() + DAYMS - 1;
const isNewCard = x => !x.practica || (!x.practica.s && !x.practica.last);
const retention = (x, now = Date.now()) => { const p = x.practica; if (!p) return 0; if (p.s) return fsrsR(Math.max(0, (now - p.last) / DAYMS), p.s); return p.ok + p.fail ? p.ok / (p.ok + p.fail) : 0; };
const dueAt = x => { const p = x.practica; return !p ? Infinity : p.s ? p.due : (p.last || 0); };   // registros antiguos sin FSRS: vencidos
function newToday() {
  const t0 = startOfToday(); let n = 0;
  for (const m of [S.casos, S.res]) for (const x of m.values()) if (!x.deleted && x.practica && x.practica.first >= t0) n++;
  return n;
}
const newPerDay = () => Number(S.cfg.newPerDay) || 15;
function todayDeck(cands, cap = 0) {
  const now = Date.now(), eod = endOfToday();
  const due = cands.filter(c => !isNewCard(c.x) && dueAt(c.x) <= eod).sort((a, b) => retention(a.x, now) - retention(b.x, now));
  const left = Math.max(0, newPerDay() - newToday());
  const nuevos = cands.filter(c => isNewCard(c.x)).sort((a, b) => byFecha(-1)(a.x, b.x)).slice(0, left);
  let deck = [...due, ...nuevos];
  if (cap) deck = deck.slice(0, cap);
  return { due, nuevos, deck };
}

/* ---------- Pantalla de práctica ---------- */
function pracPool(src = S.fp.src) {
  const out = [];
  if (src !== 'res') for (const x of live(S.casos)) out.push({ col: 'casos', id: x.id, x });
  if (src !== 'mine') {
    const mine = src === 'all' ? new Set(live(S.casos).map(dedupKey)) : new Set();
    for (const x of live(S.res)) if (!mine.has(dedupKey(x))) out.push({ col: 'residentes', id: x.id, x });   // el mismo caso en ambos lados cuenta una vez
  }
  return out;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function orderDeck(list, orden) {
  if (orden === 'azar') return shuffle(list.slice());
  if (orden === 'fecha') return list.slice().sort((a, b) => byFecha(-1)(a.x, b.x));
  const now = Date.now(), eod = endOfToday();
  const rank = c => (isNewCard(c.x) ? 1 : dueAt(c.x) <= eod ? 0 : 2);
  return shuffle(list.slice()).sort((a, b) => rank(a) - rank(b) || retention(a.x, now) - retention(b.x, now));
}
function renderPrac() {
  $('#p-setup').hidden = !!S.prac; $('#p-session').hidden = !S.prac;
  if (S.prac) return renderSession();
  renderPlan();
  const f = S.fp, pool = pracPool();
  renderEspBar($('#p-esp'), f, pool.map(p => p.x), renderPrac);
  const colOf = new Map(pool.map(p => [p.x.id, p.col]));
  const { list } = facetFilter(pool.map(p => p.x), f, { org: '#p-org', sub: '#p-sub', mes: '#p-mes', cla: '#p-cla' });
  setActiveCount($('#p-nf'), [f.organo, f.subtema, f.mes, f.clasif, f.src !== 'all' ? 'x' : ''].filter(Boolean).length);
  S.pracCands = list.map(x => ({ col: colOf.get(x.id), id: x.id, x }));
  const t = todayDeck(S.pracCands), filt = f.esp || f.organo || f.subtema || f.mes || f.clasif || f.src !== 'all';
  $('#p-today-txt').replaceChildren(t.deck.length
    ? h('span', {}, h('strong', {}, 'Para hoy: '), `${t.due.length} repaso${t.due.length === 1 ? '' : 's'} pendiente${t.due.length === 1 ? '' : 's'} y ${t.nuevos.length} caso${t.nuevos.length === 1 ? '' : 's'} nuevo${t.nuevos.length === 1 ? '' : 's'}${filt ? ' (con estos filtros)' : ''}.`)
    : h('span', {}, S.pracCands.length ? 'Nada pendiente para hoy. Puedes adelantar con «Práctica libre».' : 'No hay casos con estos filtros.'));
  $('#p-today').disabled = !t.deck.length; $('#p-short').disabled = !t.deck.length;
  $('#p-today').textContent = t.deck.length ? `Repasar lo de hoy (${t.deck.length})` : 'Repasar lo de hoy';
  $('#p-short').textContent = `Sesión corta (${Math.min(10, t.deck.length || 10)})`;
  const n = f.n === 'all' ? list.length : Math.min(list.length, Number(f.n));
  $('#p-count').textContent = list.length ? `${list.length} caso${list.length > 1 ? 's' : ''} con estos filtros.` : '';
  $('#p-start').disabled = !list.length;
  $('#p-start').textContent = list.length ? `Practicar ${n} caso${n === 1 ? '' : 's'} con estos filtros` : 'Practicar con estos filtros';
  $('#p-newday').value = String(newPerDay());
  $('#p-oral').checked = f.oral; $('#p-oralsec').value = f.oralSec; $('#p-hide').checked = f.hide;
}
function startPractice(items) {
  if (!items.length) return;
  S.prac = { deck: items.map(({ col, id }) => ({ col, id })), i: 0, revealed: false, oral: S.fp.oral, oralSec: Number(S.fp.oralSec) || 180,
    grades: { 1: 0, 2: 0, 3: 0, 4: 0 }, failed: [], requeued: new Set(), misses: { h: 0, d: 0, x: 0, c: 0 }, nOral: 0, active: true, check: null, cardStart: null };
  renderPrac(); window.scrollTo(0, 0);
}
function startFromFilters() { const d = orderDeck(S.pracCands || [], S.fp.orden); startPractice(S.fp.n === 'all' ? d : d.slice(0, Number(S.fp.n))); }

/* ---------- Modo oral: referencia desde la Biblioteca ---------- */
function mdSections(md) {
  const out = {}; let cur = '';
  for (const l of String(md || '').split('\n')) {
    if (l.startsWith('## ')) { cur = norm(l.slice(3)); out[cur] = out[cur] || []; continue; }
    if (cur && l.trim()) out[cur].push(l.replace(/^•\s*/, ''));
  }
  return out;
}
function oralRef(x) {
  const e = eff(x);
  let notas = [];
  if (e.tema) { const lc = litCoverage().get(e.tema.id); if (lc) notas = lc.notas.slice(); }
  const dxSt = stems(enToEs(x.diagnostico || ''));
  const byName = live(S.nota).filter(n => {
    const st = stems(enToEs(n.enfermedad || '')); let sh = 0;
    for (const w of st) if (dxSt.has(w)) sh++;
    return st.size && sh >= Math.min(2, st.size);
  });
  notas = [...byName, ...notas.filter(n => !byName.includes(n))];
  for (const n of notas) {
    const sec = mdSections(n.resumen), keys = Object.keys(sec);
    const dk = keys.find(k => /differential|diferencial/.test(k)), ck = keys.find(k => /checklist|perlas|puntos clave|key points|teaching points/.test(k));
    if (dk || ck) return { nota: n, ddx: dk ? sec[dk].slice(0, 8) : [], check: ck ? sec[ck].slice(0, 6) : [] };
  }
  return notas[0] ? { nota: notas[0], ddx: [], check: [] } : null;
}
const ORAL_ITEMS = [['h', 'Hallazgos descritos'], ['d', 'Diferencial jerarquizado'], ['x', 'Hallazgo discriminante'], ['c', 'Conducta o recomendación']];
function suggestedGrade(ch) {
  if (!ch || !ch.dx) return 1;
  const n = ORAL_ITEMS.filter(([k]) => ch[k]).length;
  return n === 4 ? 4 : n === 3 ? 3 : 2;
}

/* ---------- Sesión ---------- */
let _pracTimer = null;
function renderSession() {
  $('#p-setup').hidden = true; $('#p-session').hidden = false;
  clearInterval(_pracTimer);
  const P = S.prac, box = $('#p-session');
  if (!P.active) return renderSummary();
  let it = P.deck[P.i], x = it && mapOf(it.col).get(it.id);
  while (it && (!x || x.deleted)) { P.i++; it = P.deck[P.i]; x = it && mapOf(it.col).get(it.id); }
  if (!it) { P.active = false; return renderSummary(); }
  if (P.cardStart == null) P.cardStart = Date.now();
  const e = eff(x), hide = S.fp.hide && !P.revealed;
  const rows = [
    ['Fecha', x.fecha ? isoToDisp(x.fecha) : x.fechaEntrega ? `Sin fecha de estudio (mostrado ${isoToDisp(x.fechaEntrega)})` : 'Sin fecha'],
    ['RUT', x.rut ? h('span', { class: 'rutline' }, x.rut, ' ', h('button', { type: 'button', class: 'link sm', onclick: () => copyText(x.rut, 'RUT') }, 'Copiar')) : 'Sin RUT'],
    ['Modalidad', (x.modalidades || []).join(' + ')], ['Examen', x.examen], ['Tipo', x.tipo], ['Especialidad', x.especialidad],
    ['Órgano', hide ? '' : e.organo], ['Subtema', hide ? '' : e.subtema], ['Aportado por', it.col === 'residentes' ? x.residente : '']
  ].filter(r => r[1]);
  const timer = P.oral ? h('span', { class: 'ptimer', id: 'p-timer' }) : null;
  const card = h('div', { class: 'pcard', style: { '--esp': espColor(x.especialidad) } },
    h('div', { class: 'pprog' }, h('span', {}, `Caso ${P.i + 1} de ${P.deck.length}`, isNewCard(x) ? h('span', { class: 'badge lit' }, 'nuevo') : null), timer || h('span', { class: 'pscore' }, `${P.grades[1]} por repasar`)),
    h('div', { class: 'pbar' }, h('span', { style: { width: `${Math.round(100 * P.i / P.deck.length)}%` } })),
    h('dl', { class: 'kv' }, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  if (!P.revealed) {
    card.append(
      h('p', { class: 'muted phint' }, P.oral ? 'Abre el estudio y preséntalo en voz alta: hallazgos → diferencial jerarquizado → hallazgo discriminante → conducta.' : 'Abre el estudio en el PACS, interprétalo y luego revisa la respuesta.'),
      h('div', { class: 'pactions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => { P.revealed = true; P.check = P.oral ? { dx: false } : null; renderSession(); } }, 'Mostrar respuesta')));
  } else {
    card.append(h('div', { class: 'answer' },
      h('div', { class: 'lbl' }, 'Diagnóstico'),
      h('p', { class: 'ans-dx' }, x.diagnostico || 'Sin diagnóstico registrado'),
      x.notas ? h('p', { class: 'muted' }, x.notas) : null,
      e.clasif.length ? h('p', { class: 'muted' }, 'Clasificación: ' + e.clasif.join(', ')) : null,
      e.tema ? h('p', { class: 'muted' }, `Temario${e.mes ? ', mes ' + e.mes : ''}: ${e.tema.tema}`) : null));
    if (P.oral) {
      const ref = oralRef(x);
      card.append(h('div', { class: 'oralref' },
        ref ? [
          h('div', { class: 'lbl' }, `Referencia: ${fuenteLabel(ref.nota)} · ${ref.nota.enfermedad}`),
          ref.ddx.length ? [h('p', { class: 'rsub' }, 'Diferencial'), h('ul', { class: 'plain' }, ...ref.ddx.map(t => h('li', {}, t)))] : null,
          ref.check.length ? [h('p', { class: 'rsub' }, 'Puntos clave'), h('ul', { class: 'plain' }, ...ref.check.map(t => h('li', {}, t)))] : null,
          !ref.ddx.length && !ref.check.length ? h('p', { class: 'muted' }, 'La fuente no tiene sección de diferencial; ábrela en Biblioteca.') : null
        ] : h('p', { class: 'muted' }, 'Sin referencia en la Biblioteca para este tema. Sube el capítulo de STATdx o un paper para ver el diferencial aquí.')));
      const ch = P.check;
      const tog = (k, label) => h('button', { type: 'button', class: 'chip sm' + (ch[k] ? ' ok' : ''), 'aria-pressed': String(!!ch[k]), onclick: () => { ch[k] = !ch[k]; renderSession(); } }, (ch[k] ? '✓ ' : '') + label);
      card.append(h('div', { class: 'oralcheck' }, h('div', { class: 'lbl' }, '¿Qué dijiste?'),
        h('div', { class: 'chips' }, tog('dx', 'Diagnóstico correcto'), ...ORAL_ITEMS.map(([k, l]) => tog(k, l)))));
    }
    const st = x.practica && x.practica.s ? x.practica : null, sug = P.oral ? suggestedGrade(P.check) : 0;
    const gb = (g, label) => h('button', { type: 'button', class: 'btn grade g' + g + (sug === g ? ' sug' : ''), onclick: () => answer(g) },
      h('span', {}, label), h('small', {}, g === 1 ? 'hoy y mañana' : fmtIvl(fsrsNext(st, g).ivl)));
    card.append(h('div', { class: 'grades' }, gb(1, 'Otra vez'), gb(2, 'Difícil'), gb(3, 'Bien'), gb(4, 'Fácil')));
  }
  card.append(h('div', { class: 'psec' },
    h('button', { type: 'button', class: 'link sm', onclick: () => { P.i++; P.revealed = false; P.check = null; P.cardStart = null; renderSession(); } }, 'Saltar'),
    P.revealed ? h('button', { type: 'button', class: 'link sm', onclick: () => openEditCase(it.col, it.id, renderSession) }, 'Editar caso') : null,
    h('button', { type: 'button', class: 'link sm', onclick: () => { P.active = false; renderSession(); } }, 'Terminar')));
  box.replaceChildren(card);
  if (P.oral && !P.revealed) {
    const tick = () => {
      const el = $('#p-timer'); if (!el) { clearInterval(_pracTimer); return; }
      const left = P.oralSec - Math.floor((Date.now() - P.cardStart) / 1000), a = Math.abs(left);
      el.textContent = `${left < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
      el.classList.toggle('late', left < 0); el.classList.toggle('warn', left >= 0 && left <= 30);
    };
    tick(); _pracTimer = setInterval(tick, 500);
  } else if (P.oral) { const el = $('#p-timer'); if (el) { const s = Math.round((Date.now() - P.cardStart) / 1000); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }
}
async function answer(g) {
  const P = S.prac, it = P.deck[P.i], x = mapOf(it.col).get(it.id), now = Date.now();
  const p0 = x.practica || { ok: 0, fail: 0 };
  const nx = fsrsNext(p0.s ? p0 : null, g, now);
  const pr = { ...p0, ok: (p0.ok || 0) + (g > 1 ? 1 : 0), fail: (p0.fail || 0) + (g === 1 ? 1 : 0), last: now, s: nx.s, d: nx.d, due: nx.due,
    reps: (p0.reps || 0) + 1, lapses: (p0.lapses || 0) + (g === 1 && p0.s ? 1 : 0), first: p0.first || now };
  if (P.oral && P.check) {
    const o = { n: 0, h: 0, d: 0, x: 0, c: 0, ...(p0.oral || {}) }; o.n++; P.nOral++;
    for (const [k] of ORAL_ITEMS) if (!P.check[k]) { o[k]++; P.misses[k]++; }
    pr.oral = o;
  }
  await saveRecord(it.col, { ...x, practica: pr });
  P.grades[g]++;
  if (g === 1) { P.failed.push(it); if (!P.requeued.has(it.id)) { P.requeued.add(it.id); P.deck.push(it); } }
  P.i++; P.revealed = false; P.check = null; P.cardStart = null;
  if (P.i >= P.deck.length) P.active = false;
  renderSession();
}
function oralWeakText(m, n) {
  if (!n) return '';
  const worst = ORAL_ITEMS.map(([k, l]) => [l, m[k]]).sort((a, b) => b[1] - a[1])[0];
  return worst[1] ? `Lo que más te faltó: ${worst[0].toLowerCase()} (${worst[1]} de ${n} casos).` : 'En modo oral no te faltó ningún punto.';
}
function renderSummary() {
  clearInterval(_pracTimer);
  const P = S.prac, box = $('#p-session'), G = P.grades, done = G[1] + G[2] + G[3] + G[4];
  const uniqFailed = [...new Map(P.failed.map(f => [f.id, f])).values()];
  box.replaceChildren(h('div', { class: 'pcard' },
    h('h2', {}, 'Sesión terminada'),
    h('p', { class: 'pbig' }, done ? `${done - G[1]} de ${done} recordados (${Math.round(100 * (done - G[1]) / done)} %)` : 'No respondiste casos.'),
    done ? h('p', { class: 'muted' }, `Otra vez ${G[1]} · Difícil ${G[2]} · Bien ${G[3]} · Fácil ${G[4]}`) : null,
    P.nOral ? h('p', {}, oralWeakText(P.misses, P.nOral)) : null,
    uniqFailed.length ? h('div', {}, h('div', { class: 'lbl' }, 'Para repasar'),
      h('ul', { class: 'plain' }, ...uniqFailed.map(it => { const x = mapOf(it.col).get(it.id); return x ? h('li', {}, `${x.fecha ? isoToDisp(x.fecha) : 'sin fecha'}, ${x.rut || 'sin RUT'}: ${x.diagnostico || 'sin diagnóstico'}`) : null; }))) : null,
    h('div', { class: 'pactions' },
      uniqFailed.length ? h('button', { type: 'button', class: 'btn', onclick: () => startPractice(uniqFailed) }, 'Repetir los que fallé') : null,
      h('button', { type: 'button', class: 'btn primary', onclick: () => { S.prac = null; renderPrac(); } }, 'Volver'))));
}

/* ---------- Plan de exámenes ---------- */
const daysTo = iso => Math.round((new Date(iso + 'T00:00:00').getTime() - startOfToday()) / DAYMS);
function examScope(ex) { const set = new Set(ex.esps || []); return pracPool('all').filter(c => set.has(c.x.especialidad)); }
function weakSubtemas(cands) {
  const g = new Map(), now = Date.now();
  for (const c of cands) {
    const p = c.x.practica; if (!p || !(p.reps || p.ok + p.fail)) continue;
    const e = eff(c.x); if (!e.subtema) continue;
    const k = c.x.especialidad + '|' + e.subtema;
    if (!g.has(k)) g.set(k, { esp: c.x.especialidad, sub: e.subtema, r: [], n: 0 });
    const o = g.get(k); o.r.push(retention(c.x, now)); o.n++;
  }
  return [...g.values()].filter(o => o.n >= 2).map(o => ({ ...o, avg: o.r.reduce((a, b) => a + b, 0) / o.n })).sort((a, b) => a.avg - b.avg).slice(0, 4);
}
function renderPlan() {
  const box = $('#p-plan'), exams = live(S.plan).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')), today = todayIso();
  const next = exams.filter(e => !e.fecha || e.fecha >= today), past = exams.filter(e => e.fecha && e.fecha < today);
  if (!exams.length) {
    box.replaceChildren(h('div', { class: 'plancard empty' },
      h('div', {}, h('strong', {}, 'Plan de examen'), h('p', { class: 'muted' }, 'Agrega tus exámenes con fecha y materias: verás cuánto falta, qué temas no tienen casos ni literatura y qué subtemas te cuestan más.')),
      h('button', { type: 'button', class: 'btn sm', onclick: () => openExam(null) }, 'Agregar examen')));
    return;
  }
  const open = S.planOpen && next.some(e => e.id === S.planOpen) ? S.planOpen : (next[0] && next[0].id);
  const cov = coverage(), lcov = litCoverage();
  const full = ex => {
    const dd = ex.fecha ? daysTo(ex.fecha) : null, scope = examScope(ex), t = todayDeck(scope);
    const covRows = (ex.esps || []).map(esp => {
      const temas = live(S.tem).filter(tm => tm.especialidad === esp);
      if (!temas.length) return h('li', {}, h('strong', {}, esp), ': sin temario cargado.');
      const sinC = temas.filter(tm => !(cov.get(tm.id) || []).length).length, sinL = temas.filter(tm => !lcov.get(tm.id)).length;
      return h('li', {}, h('strong', {}, esp), `: ${temas.length} temas · ${sinC} sin casos · ${sinL} sin literatura `,
        sinC ? h('button', { type: 'button', class: 'link sm inline', onclick: () => { S.ft.esp = esp; S.ft.cov = 'sin'; S.ft.mes = ''; S.topicPage = null; $('#t-cov').value = 'sin'; showTab('tem'); } }, 'ver') : null);
    });
    const weak = weakSubtemas(scope);
    const om = { h: 0, d: 0, x: 0, c: 0 }; let on = 0;
    for (const c of scope) { const o = c.x.practica && c.x.practica.oral; if (o) { on += o.n; for (const k in om) om[k] += o[k] || 0; } }
    return h('div', { class: 'plancard' },
      h('div', { class: 'planhead' }, h('div', {}, h('strong', {}, ex.nombre || 'Examen'),
        h('p', { class: 'muted' }, ex.fecha ? `${isoToDisp(ex.fecha)} · ${dd === 0 ? 'hoy' : dd === 1 ? 'mañana' : `en ${dd} días`}` : 'Sin fecha')),
        h('span', { class: 'countdown' + (dd != null && dd <= 14 ? ' soon' : '') }, dd == null ? '' : String(dd), dd == null ? '' : h('small', {}, 'días'))),
      h('div', { class: 'chips' }, ...(ex.esps || []).map(e => h('span', { class: 'chip sm esp static', style: { '--esp': espColor(e) } }, e))),
      h('p', {}, h('strong', {}, 'Para hoy en este examen: '), `${t.due.length} repasos y ${t.nuevos.length} nuevos.`),
      t.deck.length ? h('button', { type: 'button', class: 'btn primary sm', onclick: () => startPractice(t.deck) }, `Repasar para este examen (${t.deck.length})`) : null,
      h('div', { class: 'lbl' }, 'Cobertura del temario'), h('ul', { class: 'plain' }, ...covRows),
      weak.length ? [h('div', { class: 'lbl' }, 'Subtemas que más te cuestan'), h('ul', { class: 'plain' }, ...weak.map(w => h('li', {},
        h('button', { type: 'button', class: 'link sm inline', onclick: () => { Object.assign(S.fp, { esp: w.esp, subtema: w.sub, organo: '', mes: '', clasif: '' }); renderPrac(); } }, w.sub),
        ` (${w.esp}): retención ${Math.round(w.avg * 100)} % en ${w.n} casos`)))] : null,
      on >= 3 ? h('p', { class: 'muted' }, 'Modo oral: ' + oralWeakText(om, on)) : null,
      ex.notas ? h('p', { class: 'muted' }, ex.notas) : null,
      h('div', { class: 'btnrow tight' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => openExam(ex.id) }, 'Editar'),
        h('button', { type: 'button', class: 'btn sm', onclick: () => openPackDialog({ title: ex.nombre || 'Examen', esps: ex.esps || [] }) }, 'Exportar paquete')));
  };
  box.replaceChildren(h('div', { class: 'plan' },
    ...next.map(ex => ex.id === open ? full(ex) : h('button', { type: 'button', class: 'planrow', onclick: () => { S.planOpen = ex.id; renderPlan(); } },
      h('span', {}, ex.nombre || 'Examen'), h('span', { class: 'muted' }, ex.fecha ? `${isoToDisp(ex.fecha)} · en ${daysTo(ex.fecha)} días` : 'Sin fecha'))),
    past.length ? h('details', { class: 'more' }, h('summary', {}, `Exámenes pasados (${past.length})`),
      h('ul', { class: 'plain' }, ...past.map(ex => h('li', {}, h('button', { type: 'button', class: 'link sm inline', onclick: () => openExam(ex.id) }, ex.nombre || 'Examen'), ` · ${isoToDisp(ex.fecha)}`)))) : null,
    h('button', { type: 'button', class: 'link sm', onclick: () => openExam(null) }, '+ Agregar examen')));
}
function openExam(id) {
  const x = id ? { ...S.plan.get(id) } : { id: 'p_' + crypto.randomUUID(), nombre: '', fecha: '', esps: [], notas: '', deleted: false };
  const d = $('#detail'), esps = new Set(x.esps || []);
  const nom = h('input', { type: 'text', 'aria-label': 'Nombre', placeholder: 'p. ej. Oral MSK, neuro y TC de cuerpo' }); nom.value = x.nombre;
  const fe = dateField(x.fecha, 'Fecha del examen');
  const box = h('div', { class: 'chips' });
  buildChoice(box, ESPECIALIDADES.map(e => ({ value: e, label: e })), () => esps, v => { esps.has(v) ? esps.delete(v) : esps.add(v); }, { esp: true, chipCls: 'sm' });
  const notas = h('textarea', { rows: '3', 'aria-label': 'Notas', placeholder: 'Contenidos, formato, bibliografía…' }); notas.value = x.notas || '';
  d.replaceChildren(h('div', { class: 'dlg' }, h('h2', {}, id ? 'Editar examen' : 'Nuevo examen'),
    h('div', { class: 'formgrid' }, h('label', { class: 'lbl' }, 'Nombre'), nom, h('span', { class: 'lbl' }, 'Fecha'), fe.el,
      h('span', { class: 'lbl' }, 'Materias'), box, h('label', { class: 'lbl' }, 'Notas'), notas),
    h('div', { class: 'dlg-actions' },
      id ? h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (!confirm('¿Eliminar este examen?')) return; await saveRecord('plan', { id, deleted: true }); d.close(); renderPrac(); } }, 'Eliminar') : null,
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => {
        const f = fe.get();
        if (f === null) { toast('Revisa la fecha (dd-mm-aaaa)', true); return; }
        if (!nom.value.trim()) { toast('Escribe el nombre del examen', true); return; }
        if (!esps.size) { toast('Elige al menos una materia', true); return; }
        await saveRecord('plan', { ...x, nombre: nom.value.trim(), fecha: f, esps: ESPECIALIDADES.filter(e => esps.has(e)), notas: notas.value.trim() });
        S.planOpen = x.id; d.close(); renderPrac(); toast('Examen guardado');
      } }, 'Guardar'))));
  d.showModal();
}

/* ---------- Paquete de estudio (JSON + TSV para Anki + imágenes, en un .zip) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  const d = new Date(), tm = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, tm, true); lh.setUint16(12, dt, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, tm, true); ch.setUint16(14, dt, true); ch.setUint32(16, crc, true); ch.setUint32(20, n, true); ch.setUint32(24, n, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + n;
  }
  const cd = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cd, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
async function deliverFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && matchMedia('(pointer:coarse)').matches && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
}
const tagSlug = s => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'x';
const deckPart = s => String(s || 'Sin tema').replace(/::/g, ' - ').replace(/\s+/g, ' ').trim().slice(0, 90);
const modOf = t => { const n = norm(t); return /\b(ct|cect|nect|cta|tc|tac)\b/.test(n) ? 'tc' : /\b(mr|mri|rm|t1|t2|flair|dwi|stir|pd)\b/.test(n) ? 'rm' : /(ultrasound|\bus\b|ecograf|doppler)/.test(n) ? 'eco' : /(radiograph|x-?ray|\brx\b)/.test(n) ? 'rx' : /(fluoro|esophagram|swallow|esofagogra|videodeglu|cistogra|uretro)/.test(n) ? 'fluoro' : /mammo|mamogra/.test(n) ? 'mamografia' : ''; };
const cell = v => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function packItems(scope) {
  const esps = new Set(scope.esps || []), temas = scope.temaIds ? new Set(scope.temaIds) : null;
  const ok = (esp, tema) => esps.has(esp) && (!temas || (tema && temas.has(tema.id)));
  const casos = pracPool('all').filter(c => ok(c.x.especialidad, eff(c.x).tema));
  const imgs = live(S.img).filter(x => ok(x.especialidad, litEff(x).tema));
  const notas = live(S.nota).filter(x => ok(x.especialidad, litEff(x).tema));
  return { casos, imgs, notas };
}
function openPackDialog(scope) {
  const P = packItems(scope), d = $('#detail');
  const cb = (label, n, on = true) => { const i = h('input', { type: 'checkbox' }); i.checked = on && n > 0; i.disabled = !n; return [i, h('label', { class: 'check' }, i, ` ${label} (${n})`)]; };
  const [ci, cl] = cb('Imágenes con leyenda: tarjetas de reconocimiento', P.imgs.length);
  const [ni, nl] = cb('Textos por fuente: tarjetas de conceptos', P.notas.length);
  const [ki, kl] = cb('Casos (en el JSON, para generar casos clínicos)', P.casos.length);
  const [si, sl] = cb('Incluir RUT y fechas de los casos (datos sensibles)', P.casos.length, false);
  d.replaceChildren(h('div', { class: 'dlg' }, h('h2', {}, 'Paquete de estudio'),
    h('p', { class: 'muted' }, `${scope.title}. Un .zip con paquete.json (para tu generador de Anki o RadStudy), tarjetas.tsv (importable en Anki) y las imágenes. Mazos Radiología::Subespecialidad::Tema::Entidad.`),
    cl, nl, kl, sl,
    h('p', { class: 'hint warn' }, 'El .zip sale sin cifrar. Sin RUT ni fechas, no contiene datos de pacientes.'),
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Cancelar'),
      h('button', { type: 'button', class: 'btn primary', onclick: e => buildPack(scope, P, { imgs: ci.checked, notas: ni.checked, casos: ki.checked, sens: si.checked }, e.currentTarget) }, 'Generar'))));
  d.showModal();
}
async function buildPack(scope, P, opt, btn) {
  if (!opt.imgs && !opt.notas && !opt.casos) { toast('Marca algo para exportar', true); return; }
  busy(btn, true, 'Preparando…');
  try {
    const files = [], cards = [], enc = new TextEncoder(), missing = [];
    const deckOf = (esp, tema, ent) => ['Radiología', deckPart(esp), deckPart(tema), deckPart(ent)].join('::');
    const tagsOf = (x, esp, tema, ent, tipo, mod) => [x.fuente === 'STATdx' ? 'statdx' : x.fuente ? tagSlug(x.fuente) : '', `subespecialidad::${tagSlug(esp)}`,
      `tema::${tagSlug(tema)}`, `entidad::${tagSlug(ent)}`, mod ? `modalidad::${mod}` : '', `tipo::${tipo}`].filter(Boolean).join(' ');
    const out = { formato: 'casos-rad/paquete-estudio@1', generado: new Date().toISOString(), titulo: scope.title, especialidades: scope.esps, imagenes: [], fuentes: [], casos: [] };
    if (opt.imgs) {
      for (const x of P.imgs) {
        const e = litEff(x), tema = e.tema ? e.tema.tema : e.subtema, file = `${x.id}.jpg`, mod = modOf(x.caption);
        let b = null;
        try { b = await blobBytes(x.blob); } catch { b = null; }
        if (!b) { missing.push(x.caption || x.enfermedad); continue; }
        files.push({ name: 'media/' + file, data: b.bytes });
        out.imagenes.push({ id: x.id, archivo: 'media/' + file, leyenda: x.caption, enfermedad: x.enfermedad, fuente: x.fuente, fuenteNombre: x.fuenteNombre || '',
          especialidad: x.especialidad, organo: e.organo, subtema: e.subtema, tema: e.tema ? e.tema.tema : '', modalidad: mod, mazo: deckOf(x.especialidad, tema, x.enfermedad),
          etiquetas: tagsOf(x, x.especialidad, tema, x.enfermedad, 'imagen', mod) });
        cards.push([`<img src="${file}"><div>¿Hallazgos y diagnóstico?</div><div class="ctx">${esc(x.especialidad)}${e.organo ? ' · ' + esc(e.organo) : ''}</div>`,
          `<b>${esc(x.enfermedad)}</b><br>${esc(x.caption)}<br><small>${esc(fuenteLabel(x))}</small>`, deckOf(x.especialidad, tema, x.enfermedad), tagsOf(x, x.especialidad, tema, x.enfermedad, 'imagen', mod)]);
      }
    }
    if (opt.notas) {
      for (const x of P.notas) {
        const e = litEff(x), tema = e.tema ? e.tema.tema : e.subtema;
        out.fuentes.push({ id: x.id, enfermedad: x.enfermedad, fuente: x.fuente, fuenteNombre: x.fuenteNombre || '', doi: x.doi || '', especialidad: x.especialidad,
          organo: e.organo, subtema: e.subtema, tema: e.tema ? e.tema.tema : '', resumen_md: x.resumen || '', mazo: deckOf(x.especialidad, tema, x.enfermedad) });
        for (const [sec, lines] of Object.entries(mdSections(x.resumen))) {
          if (!lines.length) continue;
          const title = (x.resumen.split('\n').find(l => l.startsWith('## ') && norm(l.slice(3)) === sec) || '## ' + sec).slice(3);
          cards.push([`${esc(x.enfermedad)}<br><b>${esc(title)}</b>`, `<ul>${lines.slice(0, 12).map(l => `<li>${esc(l)}</li>`).join('')}</ul><small>${esc(fuenteLabel(x))}</small>`,
            deckOf(x.especialidad, tema, x.enfermedad), tagsOf(x, x.especialidad, tema, x.enfermedad, 'concepto', '')]);
        }
      }
    }
    if (opt.casos) {
      for (const c of P.casos) {
        const x = c.x, e = eff(x);
        out.casos.push({ origen: c.col === 'casos' ? 'propio' : 'residentes', especialidad: x.especialidad, organo: e.organo, subtema: e.subtema, tema: e.tema ? e.tema.tema : '',
          mes: e.mes, clasificaciones: e.clasif, modalidades: x.modalidades || [], examen: x.examen || '', tipo: x.tipo || '', diagnostico: x.diagnostico || '', notas: x.notas || '',
          ...(opt.sens ? { rut: x.rut || '', fecha: x.fecha || '' } : {}) });
      }
    }
    const tsv = ['#separator:tab', '#html:true', '#notetype:Basic', '#deck column:3', '#tags column:4', ...cards.map(r => r.map(cell).join('\t'))].join('\n');
    files.push({ name: 'paquete.json', data: enc.encode(JSON.stringify(out, null, 1)) });
    files.push({ name: 'tarjetas.tsv', data: enc.encode(tsv) });
    files.push({ name: 'LEEME.txt', data: enc.encode([
      `Paquete de estudio: ${scope.title} (${new Date().toLocaleString('es-CL')})`, '',
      'Anki: copia el contenido de media/ en la carpeta collection.media de tu perfil y luego Archivo > Importar > tarjetas.tsv.',
      'Las columnas ya indican mazo (Radiología::Subespecialidad::Tema::Entidad) y etiquetas.', '',
      'Generador propio (genanki / RadStudy): usa paquete.json; cada imagen trae leyenda, entidad, mazo y etiquetas.',
      missing.length ? `\n${missing.length} imágenes no se incluyeron porque aún no están descargadas en este dispositivo (ábrelas una vez con conexión).` : ''].join('\n')) });
    await deliverFile(zipStore(files), `paquete_${tagSlug(scope.title)}_${todayIso()}.zip`);
    $('#detail').close();
    toast(`Paquete listo: ${out.imagenes.length} imágenes, ${cards.length} tarjetas${out.casos.length ? `, ${out.casos.length} casos` : ''}`);
  } catch (e) { toast('No se pudo generar el paquete: ' + e.message, true); }
  finally { busy(btn, false); }
}

/* ---------- Eventos ---------- */
function bindEstudioEvents() {
  for (const [id, k] of [['#p-org', 'organo'], ['#p-sub', 'subtema'], ['#p-mes', 'mes'], ['#p-cla', 'clasif'], ['#p-src', 'src'], ['#p-orden', 'orden'], ['#p-n', 'n']])
    $(id).addEventListener('change', e => { S.fp[k] = e.target.value; renderPrac(); });
  $('#p-hide').addEventListener('change', e => { S.fp.hide = e.target.checked; });
  $('#p-oral').addEventListener('change', e => { S.fp.oral = e.target.checked; });
  $('#p-oralsec').addEventListener('change', e => { S.fp.oralSec = e.target.value; });
  $('#p-newday').addEventListener('change', async e => { S.cfg.newPerDay = Number(e.target.value); await saveCfg(); renderPrac(); });
  $('#p-today').addEventListener('click', () => startPractice(todayDeck(S.pracCands || []).deck));
  $('#p-short').addEventListener('click', () => startPractice(todayDeck(S.pracCands || [], 10).deck));
  $('#p-start').addEventListener('click', startFromFilters);
  $('#t-pack').addEventListener('click', () => {
    const esp = S.ft.esp && S.ft.esp !== NONE ? S.ft.esp : '';
    if (!esp) { toast('Elige una especialidad arriba para exportar su paquete', true); return; }
    openPackDialog({ title: esp, esps: [esp] });
  });
  $('#dl-f-cla').replaceChildren(...CLASIF.map(c => h('option', { value: c[0] })));
}
