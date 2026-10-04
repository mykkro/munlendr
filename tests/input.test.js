import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input, mapControls, bodyControlFrame } from '../src/game/input.js';
import { fromBasis } from '../src/math/quat.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
function key(type, code, extra = {}) {
  return Object.assign(new Event(type, { cancelable: true }), { code, ctrlKey: false, repeat: false, ...extra });
}
function setup(pads = []) {
  const target = new EventTarget();
  const input = new Input(target, { getGamepads: () => pads });
  input.attach();
  input.setEnabled(true);
  return { target, input };
}

test('Shift held for 1 s raises the throttle command by 50%', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'ShiftLeft'));
  input.update(0.5);
  input.update(0.5);
  close(input.throttle, 0.5);
});

test('Z sets full throttle, X cuts', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'KeyZ'));
  assert.equal(input.update(0.01).throttle, 1);
  target.dispatchEvent(key('keydown', 'KeyX'));
  assert.equal(input.update(0.01).throttle, 0);
});

test('W/D/J map to intent axes', () => {
  const { target, input } = setup();
  ['KeyW', 'KeyD', 'KeyJ'].forEach((c) => target.dispatchEvent(key('keydown', c)));
  assert.deepEqual(input.update(0.01).intent, { pitch: 1, yaw: 1, fwd: 0, right: -1 });
});

test('Ctrl combos and game keys are prevented during flight (Ctrl+W would close the tab)', () => {
  const { target } = setup();
  const e = key('keydown', 'KeyW', { ctrlKey: true });
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
  const s = key('keydown', 'KeyS');
  target.dispatchEvent(s);
  assert.equal(s.defaultPrevented, true);
});

test('shortcut guard keeps blocking Ctrl combos after input is disabled (crash, pause, results)', () => {
  const { target, input } = setup();
  input.setGuard(true);
  input.setEnabled(false);
  const e = key('keydown', 'KeyS', { ctrlKey: true });
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(input.update(0.01).actions, []);
  input.setGuard(false);
  const f = key('keydown', 'KeyS', { ctrlKey: true });
  target.dispatchEvent(f);
  assert.equal(f.defaultPrevented, false);
});

test('nothing is prevented outside flight', () => {
  const { target, input } = setup();
  input.setEnabled(false);
  const e = key('keydown', 'KeyW');
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, false);
});

test('window blur releases held keys and reports blur', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'KeyW'));
  target.dispatchEvent(new Event('blur'));
  const out = input.update(0.01);
  assert.equal(out.intent.pitch, 0);
  assert.ok(out.actions.includes('blur'));
});

test('auto-repeat does not re-trigger toggles', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'KeyT'));
  target.dispatchEvent(key('keydown', 'KeyT', { repeat: true }));
  assert.deepEqual(input.update(0.01).actions, ['sas']);
});

test('gamepad triggers, sticks and edge-triggered buttons', () => {
  const pad = { buttons: Array.from({ length: 16 }, () => ({ value: 0 })), axes: [0, -1, 0.5, 0] };
  pad.buttons[7].value = 1;
  pad.buttons[3].value = 1;
  const { input } = setup([pad]);
  const a = input.update(1);
  close(a.throttle, 0.5);
  assert.equal(a.intent.pitch, 1);
  assert.deepEqual(a.look, [0.5, 0]);
  assert.deepEqual(a.actions, ['sas']);
  assert.deepEqual(input.update(0.01).actions, []);
});

test('body frame: W tilts the nose toward body +X (torque about +Y); L slides toward -Y', () => {
  const q = [1, 0, 0, 0];
  const m = mapControls({ pitch: 1, yaw: 0, fwd: 0, right: 0 }, bodyControlFrame(q), q);
  close(m.rot[0], 0); close(m.rot[1], 1);
  const t = mapControls({ pitch: 0, yaw: 0, fwd: 0, right: 1 }, bodyControlFrame(q), q);
  close(t.trans[0], 0); close(t.trans[1], -1);
});

test('camera frame: W tilts toward the camera forward direction whatever the body heading', () => {
  // world: x = east, y = north, z = up; the rocket's body X points north
  const q = fromBasis([0, 1, 0], [-1, 0, 0], [0, 0, 1]);
  const frame = { forward: [1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] }; // camera looks east
  const m = mapControls({ pitch: 1, yaw: 0, fwd: 0, right: 0 }, frame, q);
  close(m.rot[0], 1); close(m.rot[1], 0);
});
