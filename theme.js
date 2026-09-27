'use strict';
/* Tema claro, oscuro o según el sistema. Se carga sin "defer" para aplicar el tema
   antes de pintar la página (evita un destello). Es una preferencia de cada dispositivo. */
var THEME_KEY = 'casos-theme', THEME_BG = { light: '#EDF1F5', dark: '#10171E' };
function getTheme() {
  try { var t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch (e) { return 'system'; }
}
function applyTheme(t, save) {
  var forced = t === 'light' || t === 'dark', r = document.documentElement;
  if (forced) r.setAttribute('data-theme', t); else r.removeAttribute('data-theme');
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) metas[i].content = THEME_BG[forced ? t : (/dark/.test(metas[i].media) ? 'dark' : 'light')];
  if (save) { try { if (forced) localStorage.setItem(THEME_KEY, t); else localStorage.removeItem(THEME_KEY); } catch (e) { /* sin almacenamiento */ } }
}
applyTheme(getTheme(), false);
