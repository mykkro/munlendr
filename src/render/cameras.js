import { add, scale, sub, normalize, cross, dot, length, DEG } from '../math/vec3.js';
import { tangentBasis } from '../sim/frame.js';

export const VIEW_ORDER = ['chase', 'orbit', 'topdown', 'surface'];
export const VIEW_LABELS = { chase: 'Chase', orbit: 'Orbit', topdown: 'Top-down', surface: 'Surface' };

const LIMITS = {
  chase: { pitch: [-10, 85], dist: [12, 400] },
  orbit: { pitch: [-10, 89], dist: [12, 3000] },
  topdown: { pitch: [0, 0], dist: [60, 20000] },
  surface: { pitch: [0, 0], dist: [10, 75] },
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function defaultViews() {
  return {
    chase: { yaw: 0, pitch: 18, dist: 45 },
    orbit: { yaw: 210, pitch: 25, dist: 80 },
    topdown: { yaw: 0, pitch: 0, dist: 900 },
    surface: { yaw: 200, pitch: 0, dist: 55 },
  };
}

// yaw 0 = north, 90 = east
const horizontalDir = (yawDeg, east, north) => add(scale(north, Math.cos(yawDeg * DEG)), scale(east, Math.sin(yawDeg * DEG)));

function rotateAboutUp(h, up, yawDeg) {
  const side = cross(h, up);
  return add(scale(h, Math.cos(yawDeg * DEG)), scale(side, Math.sin(yawDeg * DEG)));
}

export function computePose(name, v, ctx) {
  const up = normalize(ctx.rocketPos);
  const { east, north } = tangentBasis(up);
  switch (name) {
    case 'chase': {
      const h = rotateAboutUp(ctx.heading ?? north, up, v.yaw);
      const p = v.pitch * DEG;
      const dir = add(scale(h, -Math.cos(p)), scale(up, Math.sin(p)));
      return { position: add(ctx.rocketPos, scale(dir, v.dist)), target: ctx.rocketPos, up, fov: 60 };
    }
    case 'orbit': {
      const p = v.pitch * DEG;
      const dir = add(scale(horizontalDir(v.yaw, east, north), Math.cos(p)), scale(up, Math.sin(p)));
      return { position: add(ctx.rocketPos, scale(dir, v.dist)), target: ctx.rocketPos, up, fov: 60 };
    }
    case 'topdown': {
      const b = tangentBasis(ctx.siteDir);
      return { position: add(ctx.sitePoint, scale(ctx.siteDir, v.dist)), target: ctx.sitePoint, up: horizontalDir(v.yaw, b.east, b.north), fov: 50 };
    }
    case 'surface': {
      const b = tangentBasis(ctx.siteDir);
      const position = add(add(ctx.sitePoint, scale(ctx.siteDir, 2)), scale(horizontalDir(v.yaw, b.east, b.north), 30));
      return { position, target: ctx.rocketPos, up: ctx.siteDir, fov: v.dist };
    }
    default:
      throw new Error(`unknown camera view ${name}`);
  }
}

export function controlFrame(pose, rocketPos) {
  const up = normalize(rocketPos);
  const look = sub(pose.target, pose.position);
  let f = sub(look, scale(up, dot(look, up)));
  if (length(f) < 0.2 * length(look)) f = sub(pose.up, scale(up, dot(pose.up, up))); // looking almost straight down
  const forward = normalize(f);
  return { forward, right: cross(forward, up), up };
}

export class CameraRig {
  constructor(views = defaultViews()) {
    this.views = views;
    this.active = 'chase';
    this.heading = null;
    this.invertDrag = false;
    this.drag = null;
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
  }

  cycle() {
    this.active = VIEW_ORDER[(VIEW_ORDER.indexOf(this.active) + 1) % VIEW_ORDER.length];
    return this.active;
  }

  orbit(dxDeg, dyDeg) {
    const v = this.views[this.active], L = LIMITS[this.active], s = this.invertDrag ? -1 : 1;
    v.yaw = (((v.yaw + dxDeg * s) % 360) + 360) % 360;
    v.pitch = clamp(v.pitch + dyDeg * s, L.pitch[0], L.pitch[1]);
  }

  zoom(steps) {
    const v = this.views[this.active], L = LIMITS[this.active];
    v.dist = clamp(v.dist * 1.15 ** steps, L.dist[0], L.dist[1]);
  }

  updateHeading(rocketPos, velocity, dt) {
    const up = normalize(rocketPos);
    const flat = (x) => sub(x, scale(up, dot(x, up)));
    const vh = flat(velocity);
    let h = this.heading ? flat(this.heading) : null;
    if (!h || length(h) < 1e-6) h = length(vh) > 0.5 ? vh : tangentBasis(up).north;
    h = normalize(h);
    if (length(vh) > 1) {
      const k = Math.min(1, dt * 1.5);
      h = normalize(add(scale(h, 1 - k), scale(normalize(vh), k)));
    }
    this.heading = h;
  }

  pose(ctx) {
    return computePose(this.active, this.views[this.active], { ...ctx, heading: this.heading });
  }

  attach(el) {
    this.el = el;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detach() {
    if (!this.el) return;
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('pointercancel', this.onPointerUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el = null;
  }

  onPointerDown(e) {
    this.drag = { x: e.clientX, y: e.clientY };
    e.target.setPointerCapture?.(e.pointerId);
  }

  onPointerMove(e) {
    if (!this.drag) return;
    this.orbit((e.clientX - this.drag.x) * 0.3, (e.clientY - this.drag.y) * 0.3);
    this.drag = { x: e.clientX, y: e.clientY };
  }

  onPointerUp() {
    this.drag = null;
  }

  onWheel(e) {
    e.preventDefault();
    this.zoom(Math.sign(e.deltaY));
  }
}
