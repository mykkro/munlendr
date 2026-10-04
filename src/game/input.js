import { CONFIG } from '../config.js';
import { cross } from '../math/vec3.js';
import { rotate, conjugate } from '../math/quat.js';

const ACTION_KEYS = {
  KeyZ: 'fullThrottle', KeyX: 'cut', KeyT: 'sas', KeyC: 'camera',
  KeyG: 'aids', KeyV: 'vehicleView', KeyH: 'hud', Escape: 'pause',
};
const HOLD = {
  throttleUp: ['ShiftLeft', 'ShiftRight', 'KeyR'],
  throttleDown: ['ControlLeft', 'ControlRight', 'KeyF'],
  pitchFwd: ['KeyW'], pitchBack: ['KeyS'], yawLeft: ['KeyA'], yawRight: ['KeyD'],
  fwd: ['KeyI'], back: ['KeyK'], left: ['KeyJ'], right: ['KeyL'],
};
export const GAME_CODES = new Set([...Object.keys(ACTION_KEYS), ...Object.values(HOLD).flat()]);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const deadzone = (v) => (Math.abs(v) < 0.2 ? 0 : v);

export class Input {
  constructor(target, { getGamepads, throttleRate = CONFIG.input.throttleRate } = {}) {
    this.target = target;
    this.getGamepads = getGamepads ?? (() => globalThis.navigator?.getGamepads?.() ?? []);
    this.throttleRate = throttleRate;
    this.held = new Set();
    this.queue = [];
    this.throttle = 0;
    this.enabled = false;
    this.guard = false;
    this.padPrev = {};
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
  }

  attach() {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
  }

  detach() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.held.clear();
  }

  reset(throttle = 0) {
    this.held.clear();
    this.queue.length = 0;
    this.throttle = throttle;
  }

  // The guard outlives `enabled`: a held Ctrl+S/D/W must stay blocked through a crash, pause or results.
  setGuard(on) {
    this.guard = on;
  }

  onKeyDown(e) {
    if ((this.enabled || this.guard) && (GAME_CODES.has(e.code) || e.ctrlKey)) e.preventDefault();
    if (!this.enabled) return;
    this.held.add(e.code);
    if (e.repeat) return;
    const action = ACTION_KEYS[e.code];
    if (action) this.queue.push(action);
  }

  onKeyUp(e) {
    this.held.delete(e.code);
  }

  onBlur() {
    this.held.clear();
    this.queue.push('blur');
  }

  isHeld(name) {
    return HOLD[name].some((c) => this.held.has(c));
  }

  axis(pos, neg) {
    return (this.isHeld(pos) ? 1 : 0) - (this.isHeld(neg) ? 1 : 0);
  }

  readPad(actions) {
    const none = { throttle: 0, pitch: 0, yaw: 0, fwd: 0, right: 0, look: [0, 0] };
    if (!this.enabled) return none;
    const p = Array.from(this.getGamepads() ?? []).find(Boolean);
    if (!p) return none;
    const value = (i) => { const b = p.buttons[i]; return b == null ? 0 : typeof b === 'object' ? b.value : b; };
    const pressed = (i) => (value(i) > 0.5 ? 1 : 0);
    const edge = (i, action) => {
      const now = pressed(i) === 1;
      if (now && !this.padPrev[i]) actions.push(action);
      this.padPrev[i] = now;
    };
    edge(1, 'cut');
    edge(3, 'sas');
    edge(9, 'pause');
    return {
      throttle: value(7) - value(6),
      pitch: -deadzone(p.axes[1] ?? 0),
      yaw: deadzone(p.axes[0] ?? 0),
      fwd: pressed(12) - pressed(13),
      right: pressed(15) - pressed(14),
      look: [deadzone(p.axes[2] ?? 0), deadzone(p.axes[3] ?? 0)],
    };
  }

  update(dt) {
    const actions = this.queue.splice(0);
    const pad = this.readPad(actions);
    const delta = this.axis('throttleUp', 'throttleDown') + pad.throttle;
    this.throttle = clamp(this.throttle + delta * this.throttleRate * dt, 0, 1);
    const out = [];
    for (const a of actions) {
      if (a === 'fullThrottle') this.throttle = 1;
      else if (a === 'cut') this.throttle = 0;
      else out.push(a);
    }
    const intent = {
      pitch: clamp(this.axis('pitchFwd', 'pitchBack') + pad.pitch, -1, 1),
      yaw: clamp(this.axis('yawRight', 'yawLeft') + pad.yaw, -1, 1),
      fwd: clamp(this.axis('fwd', 'back') + pad.fwd, -1, 1),
      right: clamp(this.axis('right', 'left') + pad.right, -1, 1),
    };
    return { throttle: this.throttle, intent, actions: out, look: pad.look };
  }
}

// Each key axis drives exactly one thruster pair: `a` (W/S or I/K) snaps to the body axis it is closest to,
// and `b` (A/D or J/L), being perpendicular to it, takes the other axis. So one key fires one pair at any
// camera angle (never all four), and two keys fire both pairs.
function pairCommand(a, b, ia, ib) {
  const out = [0, 0];
  const ka = Math.abs(a[0]) >= Math.abs(a[1]) ? 0 : 1, kb = 1 - ka;
  if (ia) out[ka] += Math.sign(a[ka]) * ia;
  if (ib) out[kb] += Math.sign(b[kb]) * ib;
  return out;
}

// Tilting the nose toward a horizontal direction d needs a torque about cross(up, d).
export function mapControls(intent, frame, q) {
  const { forward, right, up } = frame;
  const inv = conjugate(q);
  const toBody = (w) => rotate(inv, w);
  return {
    rot: pairCommand(toBody(cross(up, forward)), toBody(cross(up, right)), intent.pitch, intent.yaw),
    trans: pairCommand(toBody(forward), toBody(right), intent.fwd, intent.right),
  };
}

export function bodyControlFrame(q) {
  return { forward: rotate(q, [1, 0, 0]), right: rotate(q, [0, -1, 0]), up: rotate(q, [0, 0, 1]) };
}
