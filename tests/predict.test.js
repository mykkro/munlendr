import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictImpact, burnNowHeight, velocityMarkers } from '../src/sim/predict.js';
import { createRocketState } from '../src/sim/rocket.js';
import { createBody } from '../src/sim/body.js';
import { latLonToDir, tangentBasis, surfaceOffset } from '../src/sim/frame.js';
import { fromBasis } from '../src/math/quat.js';
import { scale, add, normalize } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const R = CONFIG.moon.radius;
const flat = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const site = latLonToDir(10, 20);
const { east, north } = tangentBasis(site);
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const make = (alt, vel, over = {}) => Object.assign(
  createRocketState({ position: scale(site, R + alt), velocity: vel, orientation: fromBasis(east, north, site), fuel: 700 }),
  over,
);

test('ballistic impact time and point', () => {
  const p = predictImpact(make(100, scale(east, 10)), flat);
  close(p.time, Math.sqrt((2 * 100) / 1.62), 0.2);
  close(surfaceOffset(site, normalize(p.point), R).east, 111, 3);
});

test('burn-now height with the engine already at full throttle', () => {
  const s = make(500, scale(site, -10), { engineOn: true, throttle: 1 });
  const a = 12000 / 2760 - 1.62;
  close(burnNowHeight(s, flat), 100 / (2 * a), 1);
});

test('burn-now height grows when the engine must ignite first', () => {
  const on = burnNowHeight(make(500, scale(site, -10), { engineOn: true, throttle: 1 }), flat);
  const off = burnNowHeight(make(500, scale(site, -10)), flat);
  assert.ok(off > on + 5);
});

test('burn-now height is zero while climbing', () => {
  assert.equal(burnNowHeight(make(500, scale(site, 3)), flat), 0);
});

test('velocity markers', () => {
  assert.equal(velocityMarkers(make(10, [0, 0, 0])), null);
  const m = velocityMarkers(make(10, add(scale(site, -3), scale(east, 4))));
  close(m.prograde[0] + m.retrograde[0], 0, 1e-12);
});
