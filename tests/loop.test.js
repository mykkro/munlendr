import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../src/game/loop.js';

const make = () => {
  const calls = [];
  const loop = new FixedStepLoop({ dt: 1 / 120, maxSteps: 8, step: (dt) => calls.push(dt) });
  return { loop, calls };
};

test('a 60 Hz frame runs two physics steps', () => {
  const { loop, calls } = make();
  assert.equal(loop.advance(1 / 60 + 1e-9).steps, 2);
  assert.equal(calls.length, 2);
});

test('a 5 s gap (hidden tab) runs at most 8 steps and drops the rest', () => {
  const { loop } = make();
  assert.equal(loop.advance(5).steps, 8);
  assert.ok(loop.acc < loop.dt);
  assert.equal(loop.advance(0).steps, 0);
});

test('paused loops do nothing', () => {
  const { loop, calls } = make();
  loop.paused = true;
  loop.advance(1);
  assert.equal(calls.length, 0);
});

test('alpha stays in [0, 1) and bad input counts as zero', () => {
  const { loop } = make();
  const r = loop.advance(0.004);
  assert.equal(r.steps, 0);
  assert.ok(r.alpha > 0.4 && r.alpha < 0.6);
  assert.equal(loop.advance(NaN).steps, 0);
  assert.equal(loop.advance(-3).steps, 0);
});
