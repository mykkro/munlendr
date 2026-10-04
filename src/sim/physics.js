import { CONFIG } from '../config.js';
import { add, addScaled, scale } from '../math/vec3.js';
import { rotate, integrate } from '../math/quat.js';
import { totalMass, centerOfMassZ, transverseInertia } from './rocket.js';
import { mixThrusters, updateEngine, updateThrusters, thrusterForcesAndTorque, propellantFlow } from './actuators.js';
import { sasCommand } from './sas.js';

export function step(s, cmd, env, dt) {
  const cfg = env.cfg ?? CONFIG;
  const rc = cfg.rocket;

  // 1. commands
  let rot = cmd.rot ?? [0, 0];
  const trans = cmd.trans ?? [0, 0];
  if (cmd.sas && rot[0] === 0 && rot[1] === 0) rot = sasCommand(s.w, cfg.sas);
  const thrusterCommands = mixThrusters(rot, trans, rc.thrusterOnThreshold);

  // 2. actuators
  const thrust = updateEngine(s, cmd.throttle ?? 0, dt, rc);
  updateThrusters(s, thrusterCommands, dt, rc);

  // 3. forces and torques
  const m = totalMass(s, rc);
  const zcm = centerOfMassZ(s, env.difficulty, rc);
  const inertia = transverseInertia(s, env.difficulty, rc);
  const tf = thrusterForcesAndTorque(s, zcm, rc);
  let force = add(rotate(s.q, [tf.force[0], tf.force[1], tf.force[2] + thrust]), scale(env.body.gravity(s.r), m));
  let torque = tf.torque;
  const contact = null;

  // 4. semi-implicit Euler
  s.v = addScaled(s.v, force, dt / m);
  s.r = addScaled(s.r, s.v, dt);
  s.w = [s.w[0] + (torque[0] / inertia) * dt, s.w[1] + (torque[1] / inertia) * dt, 0];
  s.q = integrate(s.q, s.w, dt);

  // 5. burn propellant
  const flow = propellantFlow(s, rc, cfg.g0);
  s.fuel = Math.max(0, s.fuel - flow.main * dt);
  s.rcs = Math.max(0, s.rcs - flow.rcs * dt);
  s.time += dt;

  return { thrust, thrusterCommands, contact, zcm, mass: m };
}
