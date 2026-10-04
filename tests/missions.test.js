import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, getMission, buildWorld, makeStartState, landingDistance, medalFor, computeScore, unlocksAfter, isUnlocked } from '../src/game/missions.js';
import { tiltDeg } from '../src/sim/contact.js';
import { normalize, dot, length, sub, scale } from '../src/math/vec3.js';

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('mission 1 starts 1500 m up, falling 20 m/s, drifting 30 m/s, upright, 1200 m from the site', () => {
  const m = getMission(1);
  const world = buildWorld(m);
  const s = makeStartState(m, world);
  const up = normalize(s.r);
  close(world.body.agl(s.r), 1500, 1e-6);
  close(dot(s.v, up), -20, 1e-9);
  close(length(sub(s.v, scale(up, dot(s.v, up)))), 30, 1e-9);
  close(tiltDeg(s), 0, 1e-6);
  close(landingDistance(world, s.r), 1200, 0.5);
  assert.equal(s.fuel, 500);
});

test('mission 2 starts 3000 m up and 2 km out with 700 kg', () => {
  const m = getMission(2);
  const world = buildWorld(m);
  const s = makeStartState(m, world);
  close(world.body.agl(s.r), 3000, 1e-6);
  close(landingDistance(world, s.r), 2000, 0.5);
  assert.equal(s.fuel, 700);
});

test('the target pad is flat', () => {
  const world = buildWorld(getMission(2));
  assert.ok(world.body.slopeDeg(world.siteDir) < 0.05);
});

test('mission 1 provides pad hints; mission 2 does not', () => {
  assert.ok(buildWorld(getMission(1)).padHints.length > 0);
  assert.equal(buildWorld(getMission(2)).padHints.length, 0);
});

test('medals for pinpoint only', () => {
  const m2 = getMission(2);
  assert.equal(medalFor(m2, 4.9), 'gold');
  assert.equal(medalFor(m2, 5), 'gold');
  assert.equal(medalFor(m2, 19), 'silver');
  assert.equal(medalFor(m2, 49), 'bronze');
  assert.equal(medalFor(m2, 51), null);
  assert.equal(medalFor(getMission(1), 1), null);
});

test('score parts, hard multiplier and crash zero', () => {
  const base = { mission: getMission(2), outcome: 'landed', grade: 'safe', fuel: 123.4, distance: 12.3, time: 95.2 };
  const easy = computeScore({ ...base, difficulty: 'easy' });
  assert.deepEqual(easy.parts, { grade: 600, fuel: 123, distance: 377, time: 205 });
  assert.equal(easy.total, 1305);
  assert.equal(computeScore({ ...base, difficulty: 'hard' }).total, 1958);
  assert.equal(computeScore({ ...base, outcome: 'crashed', difficulty: 'easy' }).total, 0);
  assert.equal(computeScore({ ...base, mission: getMission(1), difficulty: 'easy' }).parts.distance, 0);
});

test('unlocking', () => {
  assert.deepEqual(unlocksAfter(1, 'landed'), [2]);
  assert.deepEqual(unlocksAfter(1, 'crashed'), []);
  assert.equal(isUnlocked(getMission(1), []), true);
  assert.equal(isUnlocked(getMission(2), [1]), false);
  assert.equal(isUnlocked(getMission(2), [1, 2]), true);
  assert.equal(MISSIONS.length, 2);
});
