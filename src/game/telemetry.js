import { CONFIG } from '../config.js';
import { dot, sub, scale, length, normalize, angleBetween, DEG } from '../math/vec3.js';
import { rotate } from '../math/quat.js';
import { tangentBasis, surfaceOffset, bearingDeg } from '../sim/frame.js';
import { totalMass, centerOfMassZ, leverArms, deltaVRemaining } from '../sim/rocket.js';

export function computeTelemetry({ state, world, difficulty, fuelCapacity, rcsCapacity, throttleCmd, cfg = CONFIG }) {
  const rc = cfg.rocket;
  const { body, siteDir } = world;
  const up = normalize(state.r);
  const { east, north } = tangentBasis(up);
  const vs = dot(state.v, up);
  const vh = sub(state.v, scale(up, vs));
  const hs = length(vh);
  const vEast = dot(vh, east), vNorth = dot(vh, north);
  const axis = rotate(state.q, [0, 0, 1]);
  const tilt = angleBetween(axis, up) / DEG;
  const mass = totalMass(state, rc);
  const g = length(body.gravity(state.r));
  const zcm = centerOfMassZ(state, difficulty, rc);
  const arms = leverArms(zcm, rc);
  const nav = surfaceOffset(siteDir, up, body.radius);
  const agl = body.agl(state.r);
  return {
    altitude: body.altitude(state.r),
    agl,
    vs,
    hs,
    speed: length(state.v),
    hDir: hs > 0.05 ? bearingDeg(vEast, vNorth) : null,
    vEast,
    vNorth,
    timeToImpact: vs < -0.05 ? Math.max(0, agl) / -vs : null,
    tilt,
    tiltDir: tilt > 0.1 ? bearingDeg(dot(axis, east), dot(axis, north)) : null,
    axisLocal: [dot(axis, east), dot(axis, north), dot(axis, up)],
    velLocal: [vEast, vNorth, vs],
    rate: length(state.w) / DEG,
    throttleCmd,
    throttle: state.engineOn ? state.throttle : 0,
    engineOn: state.engineOn,
    igniting: !state.engineOn && state.ignition > 0,
    fuel: state.fuel,
    fuelPct: fuelCapacity > 0 ? state.fuel / fuelCapacity : 0,
    rcs: state.rcs,
    rcsPct: rcsCapacity > 0 ? state.rcs / rcsCapacity : 0,
    dv: deltaVRemaining(state, rc, cfg.g0),
    twr: rc.maxThrust / (mass * g),
    mass,
    x: nav.east,
    y: nav.north,
    targetDistance: nav.distance,
    targetBearing: nav.distance > 0.5 ? bearingDeg(-nav.east, -nav.north) : null,
    zcm,
    lTop: arms.top,
    lBot: arms.bottom,
    thrusters: state.thrusters.slice(),
  };
}

export function statusMessages({ t, judge, outcome }) {
  if (outcome) return [{ text: outcome === 'landed' ? 'LANDED' : 'CRASHED', level: outcome === 'landed' ? 'good' : 'bad' }];
  const out = [];
  if (judge.status === 'touchdown') {
    if (t.engineOn || t.igniting) out.push({ text: 'CONTACT — CUT ENGINE', level: 'warn' });
    else out.push({ text: `HOLD ${Math.max(1, Math.ceil(judge.cfg.settleTime - judge.settle))}`, level: 'good' });
  }
  if (t.fuel <= 0) out.push({ text: 'NO FUEL', level: 'bad' });
  else if (t.fuelPct < 0.1) out.push({ text: 'LOW FUEL', level: 'warn' });
  if (t.rcs <= 0) out.push({ text: 'NO RCS', level: 'bad' });
  else if (t.rcsPct < 0.15) out.push({ text: 'LOW RCS', level: 'warn' });
  return out;
}
