import { SceneRenderer } from './render/scene.js';
import { PlanetRenderer } from './render/planet/planet-renderer.js';
import { createRocketModel, updateRocketModel } from './render/rocket-model.js';
import { Markers } from './render/markers.js';
import { Dust } from './render/dust.js';
import { Debris } from './render/debris.js';
import { getMission, buildWorld } from './game/missions.js';
import { tangentBasis } from './sim/frame.js';
import { fromBasis } from './math/quat.js';
import { add, scale } from './math/vec3.js';

const mission = getMission(Number(new URLSearchParams(location.search).get('mission') ?? 1));
const world = buildWorld(mission);
const sr = new SceneRenderer(document.getElementById('view'));
sr.setSunDirection(world.sunDir);
const planet = new PlanetRenderer(sr.scene, { terrain: world.terrain, pads: world.pads });
const model = createRocketModel();
sr.scene.add(model.root);
const markers = new Markers(sr.scene);
markers.setTarget(world.sitePoint, world.siteDir, mission.targetPad.radius);
markers.setPadHints(world.padHints);
const dust = new Dust(sr.scene);
const debris = new Debris(sr.scene);
const info = document.getElementById('debug');
const up = world.siteDir;
const { east, north } = tangentBasis(up);
const q = fromBasis(east, north, up);
const rocketPos = scale(up, world.body.surfaceRadius(up) + 12);
let exploded = false;
const explode = () => {
  if (exploded) return;
  exploded = true;
  debris.explode(model, sr, { origin: rocketPos, velocity: [0, 0, 0], up });
};
window.addEventListener('keydown', (e) => { if (e.code === 'KeyK') explode(); });
window.bench = { sr, planet, world, explode };

let last = performance.now();
function frame(now) {
  const t = now / 1000, dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const camPos = add(rocketPos, add(scale(east, Math.cos(t * 0.2) * 30), add(scale(north, Math.sin(t * 0.2) * 30), scale(up, 8))));
  sr.setCamera({ position: camPos, target: rocketPos, up });
  const st = planet.update(camPos);
  const throttle = 0.5 + 0.5 * Math.sin(t);
  const thrusters = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (Math.floor(t * 2) % 8 === i ? 1 : 0));
  if (!exploded) updateRocketModel(model, { renderPos: sr.toRender(rocketPos), q, zcm: 0, engineOn: true, throttle, thrusters, time: t });
  markers.update(sr, { rocketPos, groundPoint: world.sitePoint, up, impact: { point: add(world.sitePoint, scale(east, 15)), up } });
  dust.update(dt, sr, { active: !exploded, groundPoint: world.sitePoint, up, intensity: throttle });
  debris.update(dt, sr, world.body);
  info.textContent = `chunks ${st.visible}  pending ${st.pending}  throttle ${throttle.toFixed(2)}  (K = explode)`;
  sr.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
