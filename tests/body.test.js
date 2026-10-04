import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBody } from '../src/sim/body.js';
import { createTerrain } from '../src/sim/terrain.js';
import { latLonToDir, tangentBasis, offsetDirection, surfaceOffset, bearingDeg } from '../src/sim/frame.js';
import { length, scale, dot } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const R = CONFIG.moon.radius;
const flat = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('surface gravity is 1.62 m/s^2 toward the centre', () => {
  const r = scale(latLonToDir(10, 20), R);
  const g = flat.gravity(r);
  close(length(g), 1.62, 1e-9);
  assert.ok(dot(g, r) < 0);
});

test('agl and altitude on flat terrain', () => {
  const r = scale(latLonToDir(-5, 40), R + 123);
  close(flat.agl(r), 123, 1e-6);
  close(flat.altitude(r), 123, 1e-6);
});

test('tangent basis is right-handed east/north/up', () => {
  const up = latLonToDir(0, 0);
  const { east, north } = tangentBasis(up);
  close(east[1], 1, 1e-12);
  close(north[2], 1, 1e-12);
  const pole = tangentBasis([0, 0, 1]);
  close(length(pole.east), 1, 1e-12);
});

test('offsetDirection and surfaceOffset are inverses', () => {
  const site = latLonToDir(8, 23);
  const d = offsetDirection(site, -1200, 300, R);
  const o = surfaceOffset(site, d, R);
  close(o.east, -1200, 0.05);
  close(o.north, 300, 0.05);
  close(o.distance, Math.hypot(1200, 300), 0.05);
});

test('bearing: north 0, east 90, south 180, west 270', () => {
  close(bearingDeg(0, 1), 0, 1e-9);
  close(bearingDeg(1, 0), 90, 1e-9);
  close(bearingDeg(0, -1), 180, 1e-9);
  close(bearingDeg(-1, 0), 270, 1e-9);
});

test('normal on a flat pad is vertical; slope is near zero', () => {
  const site = latLonToDir(8, 23);
  const body = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: createTerrain({ seed: 1969, radius: R, pads: [{ dir: site, radius: 60 }] }) });
  assert.ok(body.slopeDeg(site) < 0.05);
  close(dot(body.normal(site), site), 1, 1e-6);
});
