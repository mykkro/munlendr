import { escapeHtml as h } from '../hud/format.js';
import { MISSIONS, isUnlocked } from '../game/missions.js';

const KEYS_HELP = [
  ['Shift / R', 'Throttle up'], ['Ctrl / F', 'Throttle down'], ['Z', 'Full throttle'], ['X', 'Cut engine'],
  ['W / S', 'Pitch toward / away'], ['A / D', 'Yaw left / right'], ['I J K L', 'Slide without tilting'],
  ['T', 'Stability assist'], ['C', 'Next camera'], ['Drag / wheel', 'Orbit / zoom camera'],
  ['G', 'Prediction aids (easy)'], ['V', 'Vehicle view'], ['H', 'Hide HUD'], ['Esc', 'Pause'],
];
const GRADE_LABEL = { perfect: 'Perfect', safe: 'Safe', crash: 'Crash' };
const CHECK_LABEL = { vs: 'Vertical speed', hs: 'Horizontal speed', tilt: 'Tilt', rate: 'Angular rate', slope: 'Ground slope' };
const CHECK_UNIT = { vs: 'm/s', hs: 'm/s', tilt: '°', rate: '°/s', slope: '°' };
const REASON = {
  vs: 'Hit the ground too fast.',
  hs: 'Touched down sliding sideways and tipped over.',
  tilt: 'Touched down too tilted.',
  rate: 'Still rotating at touchdown.',
  slope: 'The ground was too steep and the lander tipped over.',
  hull: 'The hull hit the ground.',
  tipped: 'Tipped over after touchdown.',
};

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

export function renderTitle(root, { onPlay, onSettings }) {
  const el = mount(root, `<div class="card title">
    <h1>Munlendr</h1><p class="sub">Plan with the engine. Correct with the thrusters.</p>
    <button class="primary" data-a="play">Play</button><button data-a="settings">Settings</button></div>`);
  on(el, '[data-a=play]', onPlay);
  on(el, '[data-a=settings]', onSettings);
  el.querySelector('[data-a=play]').focus();
}

const bestLine = (best) => (best ? `${best.score}${best.medal ? ` <span class="medal ${best.medal}">${best.medal}</span>` : ''}` : '<span class="muted">—</span>');

export function renderSelect(root, { data, onPick, onBack }) {
  const cards = MISSIONS.map((m) => {
    const unlocked = isUnlocked(m, data.unlocked);
    const best = data.best[String(m.id)] ?? {};
    return `<button class="mission${unlocked ? '' : ' locked'}" data-id="${m.id}"${unlocked ? '' : ' disabled'}>
      <span class="num">${m.id}</span>
      <span class="name">${h(m.name)}</span>
      <span class="tag">${h(unlocked ? m.tagline : 'Land safely on the previous mission to unlock.')}</span>
      <span class="bests"><span>Easy ${bestLine(best.easy)}</span><span>Hard ${bestLine(best.hard)}</span></span>
    </button>`;
  }).join('');
  const el = mount(root, `<div class="card wide"><h2>Missions</h2><div class="missions">${cards}</div>
    <div class="actions"><button data-a="back">Back</button></div></div>`);
  el.querySelectorAll('.mission:not(.locked)').forEach((b) => b.addEventListener('click', () => onPick(Number(b.dataset.id))));
  on(el, '[data-a=back]', onBack);
  el.querySelector('.mission:not(.locked)')?.focus();
}

export function renderBriefing(root, { mission, difficulty, onStart, onBack }) {
  const s = mission.start;
  const goal = mission.goal.type === 'pinpoint'
    ? `Land on the green pad: within ${mission.goal.medals.bronze} m for bronze, ${mission.goal.medals.silver} m for silver, ${mission.goal.medals.gold} m for gold.`
    : 'Land safely anywhere flat. Blue rings mark flat ground; the green pad is the easiest place.';
  const el = mount(root, `<div class="card wide briefing">
    <h2>Mission ${mission.id}: ${h(mission.name)}</h2>
    <p>${h(goal)}</p>
    <ul class="facts">
      <li>Start ${s.agl} m above the ground, ${s.vUp < 0 ? `falling ${Math.abs(s.vUp)} m/s` : 'not falling yet'}, moving ${Math.hypot(s.vEast, s.vNorth)} m/s sideways.</li>
      <li>Fuel ${mission.fuel} kg, RCS ${mission.rcs} kg. Stability assist starts ${mission.sasOn ? 'on' : 'off'}.</li>
    </ul>
    <div class="difficulty" role="radiogroup">
      <button data-d="easy" class="${difficulty === 'easy' ? 'sel' : ''}"><b>Easy</b><span>Fixed centre of mass · prediction aids</span></button>
      <button data-d="hard" class="${difficulty === 'hard' ? 'sel' : ''}"><b>Hard</b><span>Shifting centre of mass · no aids · score ×1.5</span></button>
    </div>
    <details><summary>Controls</summary><table class="keys">${KEYS_HELP.map(([k, d]) => `<tr><td><kbd>${h(k)}</kbd></td><td>${h(d)}</td></tr>`).join('')}</table></details>
    <div class="actions"><button data-a="back">Back</button><button class="primary" data-a="start">Launch</button></div></div>`);
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
  const el = mount(root, `<div class="card"><h2>Something went wrong</h2><p>${h(message)}</p><div class="actions"><button data-a="back">Back</button></div></div>`);
  on(el, '[data-a=back]', onBack);
}

export function renderPause(root, { onResume, onRestart, onSettings, onQuit }) {
  const el = mount(root, `<div class="card"><h2>Paused</h2>
    <button class="primary" data-a="resume">Resume (Esc)</button>
    <button data-a="restart">Restart mission</button>
    <button data-a="settings">Settings</button>
    <button data-a="quit">Quit to menu</button></div>`);
  on(el, '[data-a=resume]', onResume);
  on(el, '[data-a=restart]', onRestart);
  on(el, '[data-a=settings]', onSettings);
  on(el, '[data-a=quit]', onQuit);
  el.querySelector('[data-a=resume]').focus();
}

export function renderResults(root, { mission, result, newBest, hasNext, onRetry, onNext, onMenu }) {
  const landed = result.outcome === 'landed';
  const title = landed ? `Landed: ${GRADE_LABEL[result.grade]}` : 'Crashed';
  const reason = landed ? '' : `<p class="reason">${h(REASON[result.reason] ?? 'The lander was destroyed.')}</p>`;
  const checks = (result.checks ?? []).map((c) => `<tr class="${c.grade}"><td>${CHECK_LABEL[c.key]}</td><td>${c.value.toFixed(c.key === 'vs' || c.key === 'hs' ? 2 : 1)} ${CHECK_UNIT[c.key]}</td><td>${GRADE_LABEL[c.grade]}</td></tr>`).join('');
  const p = result.score.parts;
  const score = landed ? `<table class="score">
    <tr><td>Landing</td><td>${p.grade}</td></tr>
    <tr><td>Fuel left</td><td>${p.fuel}</td></tr>
    ${mission.goal.type === 'pinpoint' ? `<tr><td>Accuracy (${result.distance.toFixed(1)} m)</td><td>${p.distance}</td></tr>` : ''}
    <tr><td>Time bonus</td><td>${p.time}</td></tr>
    ${result.score.multiplier !== 1 ? `<tr><td>Hard mode</td><td>×${result.score.multiplier}</td></tr>` : ''}
    <tr class="total"><td>Total</td><td>${result.score.total}</td></tr></table>` : '';
  const medal = result.medal ? `<div class="medal big ${result.medal}">${result.medal}</div>` : '';
  const el = mount(root, `<div class="card wide results ${landed ? 'ok' : 'fail'}">
    <h2>${title}</h2>${reason}${medal}${newBest ? '<p class="newbest">New best score!</p>' : ''}
    ${checks ? `<table class="checks">${checks}</table>` : ''}${score}
    <div class="actions"><button data-a="menu">Menu</button><button data-a="retry">Retry</button>${hasNext ? '<button class="primary" data-a="next">Next mission</button>' : ''}</div></div>`);
  on(el, '[data-a=retry]', onRetry);
  on(el, '[data-a=next]', onNext);
  on(el, '[data-a=menu]', onMenu);
  el.querySelector(hasNext ? '[data-a=next]' : '[data-a=retry]').focus();
}

export function renderSettings(root, { settings, onChange, onBack }) {
  const el = mount(root, `<div class="card"><h2>Settings</h2>
    <label class="field"><span>Thruster keys relative to</span>
      <select data-s="controlFrame"><option value="camera">Camera (recommended)</option><option value="body">Rocket body</option></select></label>
    <label class="field check"><input type="checkbox" data-s="invertDrag"><span>Invert camera drag</span></label>
    <label class="field"><span>HUD size</span><input type="range" min="0.7" max="1.3" step="0.05" data-s="hudScale"></label>
    <div class="actions"><button data-a="back">Back</button></div></div>`);
  const cf = el.querySelector('[data-s=controlFrame]');
  const inv = el.querySelector('[data-s=invertDrag]');
  const sc = el.querySelector('[data-s=hudScale]');
  cf.value = settings.controlFrame;
  inv.checked = settings.invertDrag;
  sc.value = String(settings.hudScale);
  const emit = () => onChange({ controlFrame: cf.value, invertDrag: inv.checked, hudScale: Number(sc.value) });
  cf.addEventListener('change', emit);
  inv.addEventListener('change', emit);
  sc.addEventListener('input', emit);
  on(el, '[data-a=back]', onBack);
}
