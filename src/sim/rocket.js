import { CONFIG } from '../config.js';
import { rotate } from '../math/quat.js';

export function createRocketState({ position, velocity, orientation, fuel, rcs = CONFIG.rocket.rcsMass }) {
  return {
    r: position.slice(),
    v: velocity.slice(),
    q: orientation.slice(),
    w: [0, 0, 0],
    fuel,
    rcs,
    throttle: 0,
    engineOn: false,
    ignition: 0,
    thrusters: [0, 0, 0, 0, 0, 0, 0, 0],
    time: 0,
  };
}

export function cloneState(s) {
  return { ...s, r: s.r.slice(), v: s.v.slice(), q: s.q.slice(), w: s.w.slice(), thrusters: s.thrusters.slice() };
}

export const totalMass = (s, rc = CONFIG.rocket) => rc.dryMass + s.fuel + s.rcs;

export function centerOfMassZ(s, difficulty, rc = CONFIG.rocket) {
  if (difficulty !== 'hard') return 0;
  return (s.fuel * rc.mainTankZ + s.rcs * rc.rcsTankZ) / totalMass(s, rc);
}

export function leverArms(zcm, rc = CONFIG.rocket) {
  return { top: rc.ringOffset - zcm, bottom: rc.ringOffset + zcm };
}

export function transverseInertia(s, difficulty, rc = CONFIG.rocket) {
  const m = totalMass(s, rc);
  const zcm = centerOfMassZ(s, difficulty, rc);
  return (m * (3 * rc.radius ** 2 + rc.height ** 2)) / 12 + m * zcm * zcm;
}

export function deltaVRemaining(s, rc = CONFIG.rocket, g0 = CONFIG.g0) {
  const m = totalMass(s, rc);
  return rc.ispMain * g0 * Math.log(m / (m - s.fuel));
}

export const bodyAxis = (s) => rotate(s.q, [0, 0, 1]);
