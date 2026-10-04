import { CONFIG } from '../config.js';
import { addScaled, scale, dot, normalize, length } from '../math/vec3.js';
import { rotate } from '../math/quat.js';
import { totalMass } from './rocket.js';
import { updateEngine, engineThrust } from './actuators.js';

export function predictImpact(s, body, cfg = CONFIG) {
  const rc = cfg.rocket, dt = cfg.predict.dt;
  let r = s.r.slice(), v = s.v.slice(), fuel = s.fuel, m = totalMass(s, rc);
  const axis = rotate(s.q, [0, 0, 1]);
  const thrust0 = engineThrust(s, rc);
  for (let t = 0; t < cfg.predict.maxTime; t += dt) {
    const thrust = fuel > 0 ? thrust0 : 0;
    v = addScaled(addScaled(v, body.gravity(r), dt), axis, (thrust / m) * dt);
    r = addScaled(r, v, dt);
    const burn = Math.min(fuel, (thrust / (rc.ispMain * cfg.g0)) * dt);
    fuel -= burn;
    m -= burn;
    if (body.agl(r) <= 0) return { point: r, time: t + dt };
  }
  return null;
}

export function burnNowHeight(s, body, cfg = CONFIG) {
  const rc = cfg.rocket, dt = 0.05;
  const up = normalize(s.r);
  let vs = dot(s.v, up);
  if (vs >= 0) return 0;
  const cosTilt = Math.max(0, dot(rotate(s.q, [0, 0, 1]), up));
  const g = length(body.gravity(s.r));
  const sim = { fuel: s.fuel, throttle: s.throttle, engineOn: s.engineOn, ignition: s.ignition };
  let m = totalMass(s, rc), lost = 0;
  for (let t = 0; t < cfg.predict.maxTime; t += dt) {
    const thrust = updateEngine(sim, 1, dt, rc);
    vs += ((thrust * cosTilt) / m - g) * dt;
    if (vs >= 0) return lost;
    lost += -vs * dt;
    const burn = Math.min(sim.fuel, (thrust / (rc.ispMain * cfg.g0)) * dt);
    sim.fuel -= burn;
    m -= burn;
  }
  return Infinity;
}

export function velocityMarkers(s) {
  const len = length(s.v);
  if (len < 0.1) return null;
  const prograde = scale(s.v, 1 / len);
  return { prograde, retrograde: scale(prograde, -1) };
}
