import { CONFIG } from '../config.js';
import { cross } from '../math/vec3.js';

export const THRUSTERS = [
  { ring: 'top', axis: 0, sign: 1 },
  { ring: 'top', axis: 0, sign: -1 },
  { ring: 'top', axis: 1, sign: 1 },
  { ring: 'top', axis: 1, sign: -1 },
  { ring: 'bottom', axis: 0, sign: 1 },
  { ring: 'bottom', axis: 0, sign: -1 },
  { ring: 'bottom', axis: 1, sign: 1 },
  { ring: 'bottom', axis: 1, sign: -1 },
];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Torque about +Y: top pushes +X, bottom pushes -X. Torque about +X: top pushes -Y, bottom pushes +Y.
export function mixThrusters(rot, trans, threshold = CONFIG.rocket.thrusterOnThreshold) {
  const ring = {
    top: [clamp(rot[1] + trans[0], -1, 1), clamp(-rot[0] + trans[1], -1, 1)],
    bottom: [clamp(-rot[1] + trans[0], -1, 1), clamp(rot[0] + trans[1], -1, 1)],
  };
  return THRUSTERS.map((t) => ring[t.ring][t.axis] * t.sign > threshold);
}

export function updateEngine(s, throttleCmd, dt, rc = CONFIG.rocket) {
  const cmd = clamp(throttleCmd, 0, 1);
  const wantOn = cmd >= rc.minThrottle;
  if (s.fuel <= 0) { s.engineOn = false; s.ignition = 0; s.throttle = 0; return 0; }
  if (!s.engineOn) {
    s.throttle = 0;
    if (!wantOn) { s.ignition = 0; return 0; }
    s.ignition += dt;
    if (s.ignition < rc.ignitionDelay) return 0;
    s.engineOn = true;
    s.ignition = 0;
    s.throttle = rc.minThrottle;
    return s.throttle * rc.maxThrust;
  }
  const target = wantOn ? cmd : 0;
  s.throttle += clamp((target - s.throttle) / rc.throttleTau, -rc.throttleRateLimit, rc.throttleRateLimit) * dt;
  if (wantOn) {
    s.throttle = Math.max(rc.minThrottle, s.throttle);
  } else if (s.throttle < rc.minThrottle) {
    s.engineOn = false;
    s.throttle = 0;
    return 0;
  }
  return s.throttle * rc.maxThrust;
}

export function updateThrusters(s, commands, dt, rc = CONFIG.rocket) {
  const k = 1 - Math.exp(-dt / rc.thrusterTau);
  for (let i = 0; i < 8; i++) {
    if (s.rcs <= 0) { s.thrusters[i] = 0; continue; }
    const target = commands[i] ? 1 : 0;
    s.thrusters[i] += (target - s.thrusters[i]) * k;
  }
}

export function thrusterForcesAndTorque(s, zcm, rc = CONFIG.rocket) {
  const force = [0, 0, 0], torque = [0, 0, 0];
  THRUSTERS.forEach((t, i) => {
    const f = s.thrusters[i] * rc.thrusterForce;
    if (f === 0) return;
    const F = [0, 0, 0];
    F[t.axis] = t.sign * f;
    const z = t.ring === 'top' ? rc.ringOffset - zcm : -(rc.ringOffset + zcm);
    const tq = cross([0, 0, z], F);
    force[t.axis] += F[t.axis];
    torque[0] += tq[0]; torque[1] += tq[1]; torque[2] += tq[2];
  });
  return { force, torque };
}

export const engineThrust = (s, rc = CONFIG.rocket) => (s.engineOn && s.fuel > 0 ? s.throttle * rc.maxThrust : 0);

export function propellantFlow(s, rc = CONFIG.rocket, g0 = CONFIG.g0) {
  const rcsOut = s.thrusters.reduce((a, o) => a + o, 0);
  return {
    main: engineThrust(s, rc) / (rc.ispMain * g0),
    rcs: (rcsOut * rc.thrusterForce) / (rc.ispRcs * g0),
  };
}
