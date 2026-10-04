import { SceneRenderer } from './render/scene.js';
import { PlanetRenderer } from './render/planet/planet-renderer.js';
import { getMission, buildWorld } from './game/missions.js';
import { tangentBasis } from './sim/frame.js';
import { add, scale } from './math/vec3.js';

const mission = getMission(Number(new URLSearchParams(location.search).get('mission') ?? 1));
const world = buildWorld(mission);
const sr = new SceneRenderer(document.getElementById('view'));
sr.setSunDirection(world.sunDir);
const planet = new PlanetRenderer(sr.scene, { terrain: world.terrain, pads: world.pads });
const info = document.getElementById('debug');
window.bench = { sr, planet, world };
const { east, north } = tangentBasis(world.siteDir);
const ground = world.body.surfaceRadius(world.siteDir);
const start = performance.now();

function frame(now) {
  const t = (now - start) / 1000;
  const alt = 400 + 1200 * (0.5 + 0.5 * Math.sin(t * 0.15));
  const offset = add(scale(east, Math.cos(t * 0.05) * 2500), scale(north, Math.sin(t * 0.05) * 2500));
  const position = add(scale(world.siteDir, ground + alt), offset);
  sr.setCamera({ position, target: world.sitePoint, up: world.siteDir });
  const st = planet.update(position);
  info.textContent = `chunks ${st.visible}  pending ${st.pending}  cached ${st.cached}  alt ${alt.toFixed(0)} m${planet.failed ? '  ERROR ' + planet.failed : ''}`;
  sr.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
