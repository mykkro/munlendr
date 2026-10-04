import { escapeHtml as h } from '../hud/format.js';
import { MISSIONS, isUnlocked } from '../game/missions.js';
import { CONTROL_GROUPS, TIPS, HUD_GUIDE } from './controls.js';
import { t, LANGS, getLanguage } from '../i18n.js';
import { FLAGS } from './flags.js';

const tr = (key, vars) => h(t(key, vars));
const keyCap = (k) => (k.startsWith('key.') ? t(k) : k);
const keyCaps = (keys) => keys.map((k) => `<kbd>${h(keyCap(k))}</kbd>`).join(' ');
const padLabel = (p) => (p.startsWith('pad.') ? t(p) : p);
const MEDALS = new Set(['gold', 'silver', 'bronze']);
const medalBadge = (m, cls = '') => (MEDALS.has(m) ? `<span class="medal ${m} ${cls}">${tr(`medal.${m}`)}</span>` : '');
const fmtNum = (n, d) => n.toFixed(d).replace('.', getLanguage() === 'cs' ? ',' : '.');

function controlsTable(withPad) {
  return CONTROL_GROUPS.map((g) => `
    <h3>${tr(g.title)}</h3>
    <table class="keys">${g.rows.map((r) => `<tr><td>${keyCaps(r.keys)}</td>${withPad ? `<td class="pad">${h(padLabel(r.pad))}</td>` : ''}<td>${tr(r.action)}</td></tr>`).join('')}</table>`).join('');
}

export function languageSwitcher(extraClass = '') {
  const current = getLanguage();
  return `<div class="lang-switch ${extraClass}" role="group" aria-label="${tr('lang.label')}">${Object.entries(LANGS).map(([code, { name }]) =>
    `<button class="flag${code === current ? ' sel' : ''}" data-lang="${code}" title="${h(name)}" aria-label="${h(name)}" aria-pressed="${code === current}">${FLAGS[code]()}</button>`).join('')}</div>`;
}

function wireLanguage(el, onLanguage) {
  el.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => onLanguage(b.dataset.lang)));
}

function mount(root, html) {
  root.innerHTML = `<div class="screen">${html}</div>`;
  root.classList.remove('hidden');
  return root.firstElementChild;
}
const on = (el, sel, fn) => el.querySelector(sel)?.addEventListener('click', fn);

export function hideScreens(root) {
  root.innerHTML = '';
  root.classList.add('hidden');
}

export function renderTitle(root, { onPlay, onHelp, onSettings, onLanguage }) {
  const el = mount(root, `<img class="title-art" src="assets/title.svg" alt="">
    ${languageSwitcher('corner')}
    <div class="card title">
    <h1>Moon Lander</h1><p class="sub">${tr('title.tagline')}</p>
    <button class="primary" data-a="play">${tr('btn.play')}</button>
    <button data-a="help">${tr('btn.howto')}</button>
    <button data-a="settings">${tr('btn.settings')}</button></div>`);
  on(el, '[data-a=play]', onPlay);
  on(el, '[data-a=help]', onHelp);
  on(el, '[data-a=settings]', onSettings);
  wireLanguage(el, onLanguage);
  el.querySelector('[data-a=play]').focus();
}

export function renderHelp(root, { onBack }) {
  const el = mount(root, `<div class="card wide help">
    <h2>${tr('help.title')}</h2>
    <p>${tr('help.intro')}</p>
    <div class="help-cols">
      <section>${controlsTable(true)}</section>
      <section>
        <h3>${tr('help.tips')}</h3><ul class="tips">${TIPS.map((k) => `<li>${tr(k)}</li>`).join('')}</ul>
        <h3>${tr('help.hud')}</h3>
        <table class="keys hud-guide">${HUD_GUIDE.map(([k, d]) => `<tr><td><b>${tr(k)}</b></td><td>${tr(d)}</td></tr>`).join('')}</table>
      </section>
    </div>
    <div class="actions"><button class="primary" data-a="back">${tr('btn.back')}</button></div></div>`);
  on(el, '[data-a=back]', onBack);
  el.querySelector('[data-a=back]').focus({ preventScroll: true }); // keep the help scrolled to the top
}

const bestLine = (best) => (best ? `${Number(best.score)}${best.medal ? ` ${medalBadge(best.medal)}` : ''}` : '<span class="muted">—</span>');

export function renderSelect(root, { data, onPick, onBack }) {
  const cards = MISSIONS.map((m) => {
    const unlocked = isUnlocked(m, data.unlocked);
    const best = data.best[String(m.id)] ?? {};
    return `<button class="mission${unlocked ? '' : ' locked'}" data-id="${m.id}"${unlocked ? '' : ' disabled'}>
      <span class="num">${m.id}</span>
      <span class="name">${tr(`mission.${m.id}.name`)}</span>
      <span class="tag">${unlocked ? tr(`mission.${m.id}.tagline`) : tr('select.locked')}</span>
      <span class="bests"><span>${tr('select.easy')} ${bestLine(best.easy)}</span><span>${tr('select.hard')} ${bestLine(best.hard)}</span></span>
    </button>`;
  }).join('');
  const el = mount(root, `<div class="card wide"><h2>${tr('select.title')}</h2><div class="missions">${cards}</div>
    <div class="actions"><button data-a="back">${tr('btn.back')}</button></div></div>`);
  el.querySelectorAll('.mission:not(.locked)').forEach((b) => b.addEventListener('click', () => onPick(Number(b.dataset.id))));
  on(el, '[data-a=back]', onBack);
  el.querySelector('.mission:not(.locked)')?.focus();
}

export function renderBriefing(root, { mission, difficulty, onStart, onBack }) {
  const s = mission.start;
  const goal = mission.goal.type === 'pinpoint' ? tr('brief.goal.pinpoint', mission.goal.medals) : tr('brief.goal.any');
  const sideways = Math.hypot(s.vEast, s.vNorth);
  const start = s.vUp < 0
    ? tr('brief.start.falling', { agl: s.agl, v: Math.abs(s.vUp), h: sideways })
    : tr('brief.start.still', { agl: s.agl, h: sideways });
  const el = mount(root, `<div class="card wide briefing">
    <h2>${tr('brief.title', { id: mission.id, name: t(`mission.${mission.id}.name`) })}</h2>
    <p>${goal}</p>
    <ul class="facts">
      <li>${start}</li>
      <li>${tr('brief.fuel', { fuel: mission.fuel, rcs: mission.rcs })} ${tr(mission.sasOn ? 'brief.sasOn' : 'brief.sasOff')}</li>
    </ul>
    <div class="difficulty" role="radiogroup">
      <button data-d="easy" class="${difficulty === 'easy' ? 'sel' : ''}"><b>${tr('diff.easy')}</b><span>${tr('diff.easyDesc')}</span></button>
      <button data-d="hard" class="${difficulty === 'hard' ? 'sel' : ''}"><b>${tr('diff.hard')}</b><span>${tr('diff.hardDesc')}</span></button>
    </div>
    <details><summary>${tr('brief.controls')}</summary>${controlsTable(false)}</details>
    <div class="actions"><button data-a="back">${tr('btn.back')}</button><button class="primary" data-a="start">${tr('btn.launch')}</button></div></div>`);
  let chosen = difficulty;
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    chosen = b.dataset.d;
    el.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('sel', x === b));
  }));
  on(el, '[data-a=start]', () => onStart(chosen));
  on(el, '[data-a=back]', onBack);
  el.querySelector('[data-a=start]').focus();
}

export function renderLoading(root, text) {
  mount(root, `<div class="card"><div class="spinner"></div><p data-k="text">${h(text)}</p></div>`);
}

export function updateLoading(root, text) {
  const p = root.querySelector('[data-k=text]');
  if (p) p.textContent = text;
}

export function renderError(root, { message, onBack }) {
  const el = mount(root, `<div class="card"><h2>${tr('error.title')}</h2><p>${h(message)}</p><div class="actions"><button data-a="back">${tr('btn.back')}</button></div></div>`);
  on(el, '[data-a=back]', onBack);
}

export function renderPause(root, { onResume, onRestart, onHelp, onSettings, onQuit }) {
  const el = mount(root, `<div class="card"><h2>${tr('pause.title')}</h2>
    <button class="primary" data-a="resume">${tr('btn.resume')}</button>
    <button data-a="help">${tr('btn.howto')}</button>
    <button data-a="restart">${tr('btn.restart')}</button>
    <button data-a="settings">${tr('btn.settings')}</button>
    <button data-a="quit">${tr('btn.quit')}</button></div>`);
  on(el, '[data-a=resume]', onResume);
  on(el, '[data-a=help]', onHelp);
  on(el, '[data-a=restart]', onRestart);
  on(el, '[data-a=settings]', onSettings);
  on(el, '[data-a=quit]', onQuit);
  el.querySelector('[data-a=resume]').focus();
}

const UNIT = { vs: 'm/s', hs: 'm/s', tilt: '°', rate: '°/s', slope: '°' };

function reasonText(reason) {
  const key = `reason.${reason}`;
  return t(key) === key ? t('reason.default') : t(key);
}

export function renderResults(root, { mission, result, newBest, hasNext, onRetry, onNext, onMenu }) {
  const landed = result.outcome === 'landed';
  const title = landed ? tr('result.landed', { grade: t(`grade.${result.grade}`) }) : tr('result.crashed');
  const reason = landed ? '' : `<p class="reason">${h(reasonText(result.reason))}</p>`;
  const checks = (result.checks ?? []).map((c) => `<tr class="${c.grade}"><td>${tr(`check.${c.key}`)}</td><td>${fmtNum(c.value, c.key === 'vs' || c.key === 'hs' ? 2 : 1)} ${UNIT[c.key]}</td><td>${tr(`grade.${c.grade}`)}</td></tr>`).join('');
  const p = result.score.parts;
  const score = landed ? `<table class="score">
    <tr><td>${tr('score.landing')}</td><td>${p.grade}</td></tr>
    <tr><td>${tr('score.fuel')}</td><td>${p.fuel}</td></tr>
    ${mission.goal.type === 'pinpoint' ? `<tr><td>${tr('score.accuracy', { d: fmtNum(result.distance, 1) })}</td><td>${p.distance}</td></tr>` : ''}
    <tr><td>${tr('score.time')}</td><td>${p.time}</td></tr>
    ${result.score.multiplier !== 1 ? `<tr><td>${tr('score.hard')}</td><td>×${fmtNum(result.score.multiplier, 1)}</td></tr>` : ''}
    <tr class="total"><td>${tr('score.total')}</td><td>${result.score.total}</td></tr></table>` : '';
  const el = mount(root, `<div class="card wide results ${landed ? 'ok' : 'fail'}">
    <h2>${title}</h2>${reason}${medalBadge(result.medal, 'big')}${newBest ? `<p class="newbest">${tr('result.newBest')}</p>` : ''}
    ${checks ? `<table class="checks">${checks}</table>` : ''}${score}
    <div class="actions"><button data-a="menu">${tr('btn.menu')}</button><button data-a="retry">${tr('btn.retry')}</button>${hasNext ? `<button class="primary" data-a="next">${tr('btn.next')}</button>` : ''}</div></div>`);
  on(el, '[data-a=retry]', onRetry);
  on(el, '[data-a=next]', onNext);
  on(el, '[data-a=menu]', onMenu);
  el.querySelector(hasNext ? '[data-a=next]' : '[data-a=retry]').focus();
}

export function renderSettings(root, { settings, onChange, onLanguage, onBack }) {
  const el = mount(root, `<div class="card"><h2>${tr('settings.title')}</h2>
    <div class="field"><span>${tr('lang.label')}</span>${languageSwitcher()}</div>
    <label class="field"><span>${tr('settings.frame')}</span>
      <select data-s="controlFrame"><option value="camera">${tr('settings.frameCamera')}</option><option value="body">${tr('settings.frameBody')}</option></select></label>
    <label class="field check"><input type="checkbox" data-s="invertDrag"><span>${tr('settings.invert')}</span></label>
    <label class="field"><span>${tr('settings.hudSize')}</span><input type="range" min="0.7" max="1.3" step="0.05" data-s="hudScale"></label>
    <div class="actions"><button data-a="back">${tr('btn.back')}</button></div></div>`);
  const cf = el.querySelector('[data-s=controlFrame]');
  const inv = el.querySelector('[data-s=invertDrag]');
  const sc = el.querySelector('[data-s=hudScale]');
  cf.value = settings.controlFrame;
  inv.checked = settings.invertDrag;
  sc.value = String(settings.hudScale);
  const emit = () => onChange({ ...settings, controlFrame: cf.value, invertDrag: inv.checked, hudScale: Number(sc.value) });
  cf.addEventListener('change', emit);
  inv.addEventListener('change', emit);
  sc.addEventListener('input', emit);
  wireLanguage(el, onLanguage);
  on(el, '[data-a=back]', onBack);
}
