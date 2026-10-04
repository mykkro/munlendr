import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTelemetry, statusMessages } from '../src/game/telemetry.js';
import { createBody } from '../src/sim/body.js';
import { createRocketState } from '../src/sim/rocket.js';
import { latLonToDir, tangentBasis, offsetDirection } from '../src/sim/frame.js';
import { fromBasis } from '../src/math/quat.js';
import { scale } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const R = CONFIG.moon.radius;
const body = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const site = latLonToDir(8, 23);
const world = { body, siteDir: site };
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

function stateAt(dir, agl, vUp) {
  const { east, north } = tangentBasis(dir);
  return createRocketState({ position: scale(dir, R + agl), velocity: scale(dir, vUp), orientation: fromBasis(east, north, dir), fuel: 700 });
}
const tele = (state) => computeTelemetry({ state, world, difficulty: 'easy', fuelCapacity: 700, rcsCapacity: 60, throttleCmd: 0 });

test('straight above the target, falling 5 m/s', () => {
  const t = tele(stateAt(site, 100, -5));
  close(t.agl, 100, 1e-6);
  close(t.vs, -5, 1e-9);
  close(t.timeToImpact, 20, 1e-6);
  close(t.tilt, 0, 1e-6);
  close(t.targetDistance, 0, 1e-6);
  assert.equal(t.targetBearing, null);
  close(t.fuelPct, 1, 1e-12);
  close(t.twr, 12000 / (2760 * 1.62), 0.01);
});

test('100 m east of the target: offset +x and bearing west', () => {
  const t = tele(stateAt(offsetDirection(site, 100, 0, R), 50, 0));
  close(t.x, 100, 0.01);
  close(t.y, 0, 0.01);
  close(t.targetBearing, 270, 0.1);
  assert.equal(t.timeToImpact, null);
});

const judge = (status, settle = 0) => ({ status, settle, cfg: CONFIG.landing });

test('touchdown with the engine running tells the player to cut it', () => {
  const t = { ...tele(stateAt(site, 3.4, 0)), engineOn: true };
  assert.deepEqual(statusMessages({ t, judge: judge('touchdown'), outcome: null })[0], { text: 'CONTACT — CUT ENGINE', level: 'warn' });
});

test('settling counts down; low fuel and outcomes are reported', () => {
  const t = tele(stateAt(site, 3.4, 0));
  assert.equal(statusMessages({ t, judge: judge('touchdown', 1.2), outcome: null })[0].text, 'HOLD 2');
  const low = { ...t, fuel: 30, fuelPct: 30 / 700 };
  assert.ok(statusMessages({ t: low, judge: judge('flying'), outcome: null }).some((m) => m.text === 'LOW FUEL'));
  assert.deepEqual(statusMessages({ t, judge: judge('landed'), outcome: 'landed' }), [{ text: 'LANDED', level: 'good' }]);
});
