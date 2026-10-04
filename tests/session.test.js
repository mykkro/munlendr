import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlightSession } from '../src/game/session.js';
import { getMission } from '../src/game/missions.js';
import { cloneState } from '../src/sim/rocket.js';
import { tangentBasis } from '../src/sim/frame.js';
import { fromBasis, fromAxisAngle, multiply, rotate } from '../src/math/quat.js';
import { createBody } from '../src/sim/body.js';
import { latLonToDir } from '../src/sim/frame.js';
import { CONFIG } from '../src/config.js';
import { scale, dot, normalize, length, sub, add } from '../src/math/vec3.js';

const dt = 1 / 120;

function placeOverPad(s, feetAbove, vDown) {
  const up = s.world.siteDir;
  const { east, north } = tangentBasis(up);
  Object.assign(s.state, { r: scale(up, s.world.body.surfaceRadius(up) + 3.4 + feetAbove), v: scale(up, -vDown), q: fromBasis(east, north, up), w: [0, 0, 0] });
  s.prev = cloneState(s.state);
}

function runUntilOutcome(s, seconds = 10, cmd = {}) {
  for (let t = 0; t < seconds && !s.outcome; t += dt) s.step(dt, cmd);
  return s.result();
}

test('falling with the engine off speeds up and nothing ends', () => {
  const s = new FlightSession({ mission: getMission(1), difficulty: 'easy' });
  const up = normalize(s.state.r);
  const v0 = dot(s.state.v, up);
  for (let i = 0; i < 120; i++) s.step(dt, {});
  assert.ok(dot(s.state.v, up) < v0 - 1.5);
  assert.equal(s.outcome, null);
  assert.equal(s.sas, true);
});

test('snapshot interpolates between the last two physics states', () => {
  const s = new FlightSession({ mission: getMission(1), difficulty: 'easy' });
  s.step(dt, {});
  const mid = s.snapshot(0.5).r;
  const half = length(sub(s.state.r, s.prev.r)) / 2;
  assert.ok(Math.abs(length(sub(mid, s.prev.r)) - half) < 1e-6);
});

test('a gentle touchdown on the mission 2 pad lands, scores and wins gold', () => {
  const s = new FlightSession({ mission: getMission(2), difficulty: 'easy' });
  placeOverPad(s, 0.2, 0.5);
  const r = runUntilOutcome(s);
  assert.equal(r.outcome, 'landed');
  assert.equal(r.grade, 'perfect');
  assert.equal(r.medal, 'gold');
  assert.ok(r.score.total > 2000);
});

test('slamming into the pad crashes with zero score and stops the simulation', () => {
  const s = new FlightSession({ mission: getMission(2), difficulty: 'hard' });
  placeOverPad(s, 2, 8);
  const r = runUntilOutcome(s);
  assert.equal(r.outcome, 'crashed');
  assert.equal(r.score.total, 0);
  const t = s.state.time;
  s.step(dt, {});
  assert.equal(s.state.time, t);
});

test('a square touchdown on a 9.9 degree slope (still "safe") lands instead of tipping over', () => {
  const R = CONFIG.moon.radius;
  const site = latLonToDir(8, 23);
  const { east, north } = tangentBasis(site);
  const slope = (9.9 * Math.PI) / 180;
  const terrain = { seed: 1, radius: R, height: (d) => Math.tan(slope) * dot(sub(scale(d, R), scale(site, R)), east) };
  const body = createBody({ radius: R, gm: CONFIG.moon.gm, terrain });
  const world = { body, terrain, siteDir: site, sitePoint: body.surfacePoint(site), pads: [], padHints: [], sunDir: site };
  const s = new FlightSession({ mission: getMission(1), difficulty: 'easy', world });
  s.sas = false;
  const q = multiply(fromAxisAngle(north, -slope), fromBasis(east, north, site)); // axis along the slope normal
  const normal = rotate(q, [0, 0, 1]);
  Object.assign(s.state, { r: add(body.surfacePoint(site), scale(normal, 3.45)), v: scale(normal, -0.3), q, w: [0, 0, 0] });
  s.prev = cloneState(s.state);
  const r = runUntilOutcome(s, 10);
  assert.equal(r?.outcome, 'landed', JSON.stringify(r && { reason: r.reason, checks: r.checks }));
});

test('aids are only available on easy', () => {
  assert.equal(new FlightSession({ mission: getMission(1), difficulty: 'easy' }).aidsAvailable, true);
  assert.equal(new FlightSession({ mission: getMission(1), difficulty: 'hard' }).aidsAvailable, false);
});
