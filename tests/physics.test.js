import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/physics.js';
import { sasCommand } from '../src/sim/sas.js';
import { createRocketState, totalMass } from '../src/sim/rocket.js';
import { createBody } from '../src/sim/body.js';
import { length, sub } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const dt = 1 / 120;
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const space = createBody({ radius: 1000, gm: 0, terrain: { height: () => 0 } });
const moon = createBody({ radius: CONFIG.moon.radius, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const free = (difficulty = 'easy') => ({ body: space, difficulty, contacts: false });
const make = (over = {}) => Object.assign(createRocketState({ position: [0, 0, 1e7], velocity: [0, 0, 0], orientation: [1, 0, 0, 0], fuel: 700 }), over);
const runFor = (s, cmd, env, seconds) => { for (let i = 0; i < Math.round(seconds / dt); i++) step(s, cmd, env, dt); };

test('free fall near the surface accelerates at local g', () => {
  const r0 = CONFIG.moon.radius + 1000;
  const s = make({ r: [r0, 0, 0] });
  runFor(s, {}, { body: moon, difficulty: 'easy', contacts: false }, 1);
  close(-s.v[0], CONFIG.moon.gm / r0 ** 2, 0.01);
});

test('circular orbit keeps its radius over one period', () => {
  const r0 = CONFIG.moon.radius + 20000;
  const v0 = Math.sqrt(CONFIG.moon.gm / r0);
  const s = make({ r: [r0, 0, 0], v: [0, v0, 0] });
  const period = (2 * Math.PI * r0) / v0;
  runFor(s, {}, { body: moon, difficulty: 'easy', contacts: false }, period);
  close(length(s.r), r0, r0 * 0.001);
});

test('main engine obeys the rocket equation', () => {
  const s = make();
  const m0 = totalMass(s);
  runFor(s, { throttle: 1 }, free(), 30);
  const dv = length(s.v);
  close(dv, CONFIG.rocket.ispMain * CONFIG.g0 * Math.log(m0 / totalMass(s)), dv * 0.005);
});

test('roll stays zero', () => {
  const s = make({ w: [0, 0, 1] });
  step(s, {}, free(), dt);
  assert.equal(s.w[2], 0);
});

test('rotation keys spin without drifting (easy)', () => {
  const s = make();
  runFor(s, { rot: [0, 1] }, free(), 1);
  assert.ok(s.w[1] > 0.1);
  assert.ok(length(s.v) < 1e-6);
});

test('translation keys slide without spinning (easy) but spin a little (hard)', () => {
  const easy = make();
  runFor(easy, { trans: [1, 0] }, free('easy'), 1);
  assert.ok(easy.v[0] > 0.2);
  assert.ok(Math.abs(easy.w[1]) < 1e-9);
  const hard = make();
  runFor(hard, { trans: [1, 0] }, free('hard'), 1);
  assert.ok(Math.abs(hard.w[1]) > 1e-4);
});

test('SAS brings rotation below its threshold', () => {
  const s = make({ w: [0.2, -0.1, 0] });
  runFor(s, { sas: true }, free(), 10);
  assert.ok(Math.hypot(s.w[0], s.w[1]) < CONFIG.sas.rateThreshold * 2);
  assert.ok(s.rcs < 60);
});

test('sasCommand opposes the spin and idles below threshold', () => {
  assert.deepEqual(sasCommand([0.1, -0.1, 0]), [-1, 1]);
  assert.deepEqual(sasCommand([0.001, 0, 0]), [0, 0]);
});

test('propellant running out mid-step never goes negative and stops thrust', () => {
  const s = make({ fuel: 0.001, engineOn: true, throttle: 1 });
  step(s, { throttle: 1 }, free(), dt);
  assert.equal(s.fuel, 0);
  const v = s.v.slice();
  runFor(s, { throttle: 1 }, free(), 1);
  close(length(sub(s.v, v)), 0, 1e-9);
  const r = make({ rcs: 0.0001, thrusters: [1, 0, 0, 0, 0, 0, 0, 0] });
  runFor(r, { trans: [1, 0] }, free(), 1);
  assert.equal(r.rcs, 0);
  assert.ok(r.thrusters.every((o) => o === 0));
});
