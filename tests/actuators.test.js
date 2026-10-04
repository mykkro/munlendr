import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixThrusters, updateEngine, updateThrusters, thrusterForcesAndTorque, propellantFlow } from '../src/sim/actuators.js';
import { createRocketState } from '../src/sim/rocket.js';
import { CONFIG } from '../src/config.js';

const dt = 1 / 120;
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const make = (fuel = 500) => createRocketState({ position: [0, 0, 1], velocity: [0, 0, 0], orientation: [1, 0, 0, 0], fuel });
const run = (s, cmd, seconds) => { let t = 0; for (let i = 0; i < Math.round(seconds / dt); i++) t = updateEngine(s, cmd, dt); return t; };

test('ignition delay of 0.5 s from off', () => {
  const s = make();
  assert.equal(run(s, 1, 59 * dt), 0);
  assert.ok(run(s, 1, 3 * dt) > 0);
  assert.equal(s.engineOn, true);
});

test('commands below 10% never ignite', () => {
  const s = make();
  assert.equal(run(s, 0.05, 2), 0);
  assert.equal(s.engineOn, false);
});

test('rate limit of 60%/s right after ignition, then lag towards the command', () => {
  const s = make();
  run(s, 1, 0.5 + 2 * dt);
  run(s, 1, 0.5);
  close(s.throttle, 0.4, 0.02);
  run(s, 1, 6);
  assert.ok(s.throttle > 0.99);
});

test('cut to zero winds down and switches off', () => {
  const s = make();
  run(s, 0.5, 4);
  assert.equal(s.engineOn, true);
  run(s, 0, 2);
  assert.equal(s.engineOn, false);
  assert.equal(s.throttle, 0);
});

test('no fuel means no thrust', () => {
  const s = make(0);
  assert.equal(run(s, 1, 2), 0);
  assert.equal(s.engineOn, false);
});

test('rotation pair: forces cancel, torques add (easy)', () => {
  const s = make();
  s.thrusters = mixThrusters([0, 1], [0, 0]).map((on) => (on ? 1 : 0));
  const { force, torque } = thrusterForcesAndTorque(s, 0);
  force.forEach((f) => close(f, 0, 1e-9));
  close(torque[1], 2 * 400 * 3, 1e-9);
  const sx = make();
  sx.thrusters = mixThrusters([1, 0], [0, 0]).map((on) => (on ? 1 : 0));
  close(thrusterForcesAndTorque(sx, 0).torque[0], 2400, 1e-9);
});

test('translation pair: torques cancel in easy, residual in hard', () => {
  const s = make();
  s.thrusters = mixThrusters([0, 0], [1, 0]).map((on) => (on ? 1 : 0));
  const easy = thrusterForcesAndTorque(s, 0);
  close(easy.force[0], 800, 1e-9);
  easy.torque.forEach((t) => close(t, 0, 1e-9));
  const hard = thrusterForcesAndTorque(s, -0.36);
  assert.ok(Math.abs(hard.torque[1]) > 1);
});

test('thrusters reach 63% in 50 ms and stop without RCS', () => {
  const s = make();
  const on = [true, false, false, false, false, false, false, false];
  for (let i = 0; i < 6; i++) updateThrusters(s, on, dt);
  close(s.thrusters[0], 1 - Math.exp(-1), 0.01);
  s.rcs = 0;
  updateThrusters(s, on, dt);
  assert.equal(s.thrusters[0], 0);
});

test('propellant flow from thrust and Isp', () => {
  const s = make();
  s.engineOn = true; s.throttle = 1; s.thrusters[0] = 1;
  const f = propellantFlow(s);
  close(f.main, 12000 / (311 * CONFIG.g0), 1e-12);
  close(f.rcs, 400 / (220 * CONFIG.g0), 1e-12);
});
