import { SceneRenderer } from './render/scene.js';
import { Input } from './game/input.js';
import { Flight } from './flight.js';
import { Hud } from './hud/hud.js';
import { MISSIONS, unlocksAfter } from './game/missions.js';
import { createStorage, recordAttempt, isNewBest } from './game/storage.js';
import * as UI from './ui/screens.js';

const canvas = document.getElementById('view');
const screens = document.getElementById('screens');
const hud = new Hud(document.getElementById('hud'));
const storage = createStorage();
let data = storage.load();
hud.setScale(data.settings.hudScale);

const input = new Input(window);
input.attach();

let sr = null;
let rendererError = null;
try {
  sr = new SceneRenderer(canvas);
} catch (e) {
  rendererError = `This browser could not start WebGL (${e.message}).`;
}

let flight = null;
let current = null; // { mission, difficulty }
let state = 'menu'; // menu | loading | flying | paused | results

const save = () => storage.save(data);

function stopFlight() {
  flight?.dispose();
  flight = null;
  hud.show(false);
  canvas.classList.add('hidden');
}

function showTitle() {
  stopFlight();
  state = 'menu';
  if (rendererError) return UI.renderError(screens, { message: rendererError, onBack: () => location.reload() });
  UI.renderTitle(screens, { onPlay: showSelect, onSettings: () => showSettings(showTitle) });
}

function showSelect() {
  UI.renderSelect(screens, { data, onPick: (id) => showBriefing(MISSIONS.find((m) => m.id === id)), onBack: showTitle });
}

function showBriefing(mission, difficulty = current?.difficulty ?? 'easy') {
  UI.renderBriefing(screens, { mission, difficulty, onStart: (d) => startFlight(mission, d), onBack: showSelect });
}

function showSettings(back) {
  UI.renderSettings(screens, {
    settings: data.settings,
    onChange: (settings) => {
      data = { ...data, settings };
      save();
      hud.setScale(settings.hudScale);
      flight?.applySettings(settings);
    },
    onBack: back,
  });
}

async function startFlight(mission, difficulty) {
  stopFlight();
  current = { mission, difficulty };
  state = 'loading';
  UI.renderLoading(screens, 'Loading terrain…');
  const f = new Flight({ sceneRenderer: sr, input, mission, difficulty, settings: data.settings, hud, onEnd: endFlight, onPauseRequest: pauseFlight });
  flight = f;
  try {
    await f.load((pending) => UI.updateLoading(screens, pending > 0 ? `Loading terrain… ${pending} tiles to go` : 'Almost there…'));
  } catch (e) {
    if (flight !== f) return; // the player left while loading
    stopFlight();
    state = 'menu';
    UI.renderError(screens, { message: e.message, onBack: showTitle });
    return;
  }
  if (flight !== f) return;
  UI.hideScreens(screens);
  canvas.classList.remove('hidden');
  sr.resize();
  hud.show(true);
  state = 'flying';
  f.start();
}

function showPauseMenu() {
  UI.renderPause(screens, {
    onResume: resumeFlight,
    onRestart: () => startFlight(current.mission, current.difficulty),
    onSettings: () => showSettings(showPauseMenu),
    onQuit: showTitle,
  });
}

function pauseFlight() {
  if (!flight || state !== 'flying') return;
  flight.pause();
  state = 'paused';
  showPauseMenu();
}

function resumeFlight() {
  if (!flight || state !== 'paused') return;
  UI.hideScreens(screens);
  state = 'flying';
  flight.resume();
}

function endFlight(result) {
  const { mission, difficulty } = current;
  const attempt = {
    mission: mission.id, difficulty, outcome: result.outcome, grade: result.grade,
    score: result.score.total, medal: result.medal, fuel: Math.round(result.fuel),
    distance: Math.round(result.distance * 10) / 10, time: Math.round(result.time * 10) / 10,
    date: new Date().toISOString(),
  };
  const newBest = isNewBest(data, attempt);
  data = recordAttempt(data, attempt, unlocksAfter(mission.id, result.outcome));
  save();
  state = 'results';
  hud.show(false);
  setTimeout(() => { if (state === 'results') input.setGuard(false); }, 800); // a still-held Ctrl+key must not fire on the results screen
  const next = MISSIONS.find((m) => m.unlockedBy === mission.id && data.unlocked.includes(m.id));
  UI.renderResults(screens, {
    mission, result, newBest,
    hasNext: result.outcome === 'landed' && !!next,
    onRetry: () => startFlight(mission, difficulty),
    onNext: () => { stopFlight(); state = 'menu'; showBriefing(next, difficulty); },
    onMenu: showTitle,
  });
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'paused') {
    e.preventDefault();
    resumeFlight();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseFlight(); });
window.addEventListener('beforeunload', (e) => {
  if (state === 'flying' || state === 'paused') {
    e.preventDefault();
    e.returnValue = '';
  }
});

showTitle();
