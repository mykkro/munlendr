import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRocketState, cloneState, totalMass, centerOfMassZ, leverArms, transverseInertia, deltaVRemaining } from '../src/sim/rocket.js';
import { CONFIG } from '../src/config.js';

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const make = (fuel, rcs = 60) => createRocketState({ position: [0, 0, 1], velocity: [0, 0, 0], orientation: [1, 0, 0, 0], fuel, rcs });

test('mass is dry + fuel + rcs', () => {
  assert.equal(totalMass(make(700)), 2760);
});

test('easy mode CoM fixed at the centre; hard mode CoM rises as fuel burns', () => {
  assert.equal(centerOfMassZ(make(700), 'easy'), 0);
  close(centerOfMassZ(make(700), 'hard'), (700 * -1.5 + 60 * 1.0) / 2760, 1e-12);
  assert.ok(centerOfMassZ(make(100), 'hard') > centerOfMassZ(make(700), 'hard'));
  const arms = leverArms(-0.36);
  close(arms.top, 3.36, 1e-12);
  close(arms.bottom, 2.64, 1e-12);
});

test('inertia matches the solid cylinder; one pair gives about 11 deg/s^2 at 3500 kg', () => {
  const s = make(1440);
  close(transverseInertia(s, 'easy'), 3500 * (3 * 1.5 ** 2 + 36) / 12, 1e-9);
  const alpha = (2 * CONFIG.rocket.thrusterForce * 3) / transverseInertia(s, 'easy');
  close(alpha * 180 / Math.PI, 11.03, 0.05);
});

test('remaining delta-v follows the rocket equation', () => {
  const s = make(700);
  close(deltaVRemaining(s), 311 * 9.80665 * Math.log(2760 / 2060), 1e-9);
});

test('cloneState is deep for arrays', () => {
  const s = make(500);
  const c = cloneState(s);
  c.r[0] = 99; c.thrusters[3] = 1;
  assert.equal(s.r[0], 0);
  assert.equal(s.thrusters[3], 0);
});
