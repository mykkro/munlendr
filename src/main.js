import { SceneRenderer } from './render/scene.js';
import { Input } from './game/input.js';
import { Flight } from './flight.js';
import { getMission } from './game/missions.js';
import { defaultData } from './game/storage.js';
import { Hud } from './hud/hud.js';

const sr = new SceneRenderer(document.getElementById('view'));
const input = new Input(window);
input.attach();
const screens = document.getElementById('screens');
const hud = new Hud(document.getElementById('hud'));
const params = new URLSearchParams(location.search);
const mission = getMission(Number(params.get('mission') ?? 1));
const difficulty = params.get('difficulty') === 'hard' ? 'hard' : 'easy';
let flight = null;

async function begin() {
  flight?.dispose();
  screens.onclick = null;
  screens.textContent = 'Loading terrain…';
  flight = new Flight({
    sceneRenderer: sr, input, mission, difficulty, settings: defaultData().settings, hud,
    onEnd: (r) => {
      screens.textContent = `${r.outcome.toUpperCase()} (${r.grade}${r.reason ? `, ${r.reason}` : ''}) — score ${r.score.total}. Click to retry.`;
      screens.onclick = begin;
    },
    onPauseRequest: () => {},
  });
  await flight.load((pending) => { screens.textContent = `Loading terrain… ${pending}`; });
  screens.textContent = '';
  hud.show(true);
  flight.start();
}

begin().catch((e) => { screens.textContent = `Error: ${e.message}`; });
