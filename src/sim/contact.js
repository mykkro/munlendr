import { CONFIG } from '../config.js';
import { add, sub, scale, dot, cross, length, normalize, angleBetween, DEG } from '../math/vec3.js';
import { rotate, conjugate } from '../math/quat.js';

export const EMPTY_CONTACT = Object.freeze({ force: [0, 0, 0], torque: [0, 0, 0], feet: [], anyFoot: false, hullHit: false });

export function computeContacts(s, zcm, body, cfg = CONFIG) {
  const L = cfg.legs;
  if (body.agl(s.r) > L.contactCheckAgl) return EMPTY_CONTACT;
  const wWorld = rotate(s.q, s.w);
  let force = [0, 0, 0], torqueW = [0, 0, 0], anyFoot = false;
  const feet = L.feet.map((f) => {
    const relW = rotate(s.q, [f[0], f[1], f[2] - zcm]);
    const pos = add(s.r, relW);
    const dir = normalize(pos);
    const ground = body.surfaceRadius(dir);
    const depth = ground - length(pos);
    if (depth > 0) {
      anyFoot = true;
      const n = body.normal(dir);
      const vp = add(s.v, cross(wWorld, relW));
      const vn = dot(vp, n);
      const fn = Math.max(0, L.stiffness * depth - L.damping * vn);
      let ft = scale(sub(vp, scale(n, vn)), -L.frictionDamping);
      const ftMag = length(ft), maxFt = L.frictionCoeff * fn;
      if (ftMag > maxFt && ftMag > 0) ft = scale(ft, maxFt / ftMag);
      const F = add(scale(n, fn), ft);
      force = add(force, F);
      torqueW = add(torqueW, cross(relW, F));
    }
    return { pos, groundPoint: scale(dir, ground), depth, contact: depth > 0 };
  });
  const hullHit = cfg.hullProbes.some((p) => {
    const pos = add(s.r, rotate(s.q, [p[0], p[1], p[2] - zcm]));
    return length(pos) < body.surfaceRadius(normalize(pos));
  });
  return { force, torque: rotate(conjugate(s.q), torqueW), feet, anyFoot, hullHit };
}

export const tiltDeg = (s) => angleBetween(rotate(s.q, [0, 0, 1]), s.r) / DEG;

// Normal of the ground plane under the four feet (falls back to the local vertical).
function legPlaneNormal(s, contact) {
  const up = normalize(s.r);
  const g = contact.feet.map((f) => f.groundPoint);
  const n = g.length === 4 ? normalize(cross(sub(g[0], g[1]), sub(g[2], g[3]))) : up;
  return dot(n, up) < 0 ? scale(n, -1) : n;
}

// Tilt relative to the ground under the feet: a lander resting square on a slope is not tipping.
export function groundTiltDeg(s, contact) {
  if (contact.feet.length !== 4) return tiltDeg(s);
  return angleBetween(rotate(s.q, [0, 0, 1]), legPlaneNormal(s, contact)) / DEG;
}

export function touchdownMetrics(s, contact, body) {
  const up = normalize(s.r);
  const n = legPlaneNormal(s, contact);
  const vn = dot(s.v, n);
  return {
    vs: Math.abs(vn),
    hs: length(sub(s.v, scale(n, vn))),
    tilt: tiltDeg(s),
    rate: length(s.w) / DEG,
    slope: angleBetween(n, up) / DEG,
  };
}

const ORDER = { perfect: 0, safe: 1, crash: 2 };
export const worstGrade = (a, b) => (ORDER[a] >= ORDER[b] ? a : b);

export function gradeTouchdown(m, L = CONFIG.landing) {
  const checks = ['vs', 'hs', 'tilt', 'rate', 'slope'].map((key) => {
    const value = m[key];
    const grade = value < L.perfect[key] ? 'perfect' : value < L.safe[key] ? 'safe' : 'crash';
    return { key, value, grade };
  });
  return { grade: checks.reduce((g, c) => worstGrade(g, c.grade), 'perfect'), checks };
}

export class LandingJudge {
  constructor(cfg = CONFIG.landing) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.status = 'flying';
    this.grade = null;
    this.checks = null;
    this.reason = null;
    this.settle = 0;
    this.airborne = 0;
    this.wasTouching = false;
  }

  crash(reason) {
    this.status = 'crashed';
    this.reason = reason;
    return this.status;
  }

  update({ contact, engineOff, tiltDeg: tilt, metricsFn, dt }) {
    if (this.status === 'landed' || this.status === 'crashed') return this.status;
    const touching = contact.anyFoot;
    if (touching && !this.wasTouching) {
      const g = gradeTouchdown(metricsFn(), this.cfg);
      if (g.grade === 'crash') {
        this.grade = 'crash';
        this.checks = g.checks;
        return this.crash(g.checks.find((c) => c.grade === 'crash').key);
      }
      if (this.status === 'flying' || worstGrade(g.grade, this.grade) !== this.grade) {
        this.grade = g.grade;
        this.checks = g.checks;
      }
      this.status = 'touchdown';
    }
    // graded first: a fast impact reports its speed even when the hull also hits on that step
    if (contact.hullHit) return this.crash('hull');
    this.wasTouching = touching;
    if (this.status !== 'touchdown') return this.status;
    if (tilt >= this.cfg.tipOverTilt) return this.crash('tipped');
    if (touching) {
      this.airborne = 0;
    } else {
      this.airborne += dt;
      if (this.airborne > this.cfg.hopResetTime) {
        this.reset();
        return this.status;
      }
    }
    if (touching && engineOff) {
      this.settle += dt;
      if (this.settle >= this.cfg.settleTime) this.status = 'landed';
    } else {
      this.settle = 0;
    }
    return this.status;
  }
}
