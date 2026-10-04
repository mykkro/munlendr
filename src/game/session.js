import { CONFIG } from '../config.js';
import { step as physicsStep } from '../sim/physics.js';
import { cloneState } from '../sim/rocket.js';
import { LandingJudge, EMPTY_CONTACT, tiltDeg, touchdownMetrics } from '../sim/contact.js';
import { lerp } from '../math/vec3.js';
import { slerp } from '../math/quat.js';
import { buildWorld, makeStartState, landingDistance, computeScore, medalFor } from './missions.js';

export class FlightSession {
  constructor({ mission, difficulty, cfg = CONFIG, world }) {
    this.mission = mission;
    this.difficulty = difficulty;
    this.cfg = cfg;
    this.world = world ?? buildWorld(mission, cfg);
    this.state = makeStartState(mission, this.world);
    this.prev = cloneState(this.state);
    this.judge = new LandingJudge(cfg.landing);
    this.sas = mission.sasOn;
    this.lastStep = null;
    this.outcome = null;
    this.env = { body: this.world.body, difficulty, cfg };
  }

  get aidsAvailable() {
    return this.difficulty === 'easy';
  }

  step(dt, cmd = {}) {
    if (this.outcome) return;
    this.prev = cloneState(this.state);
    const info = physicsStep(
      this.state,
      { throttle: cmd.throttle ?? 0, rot: cmd.rot ?? [0, 0], trans: cmd.trans ?? [0, 0], sas: this.sas },
      this.env,
      dt,
    );
    this.lastStep = info;
    const contact = info.contact ?? EMPTY_CONTACT;
    const status = this.judge.update({
      contact,
      engineOff: !this.state.engineOn && this.state.ignition === 0,
      tiltDeg: tiltDeg(this.state),
      metricsFn: () => touchdownMetrics(this.state, contact, this.world.body),
      dt,
    });
    if (status === 'landed' || status === 'crashed') this.finish(status);
  }

  finish(status) {
    const distance = landingDistance(this.world, this.state.r);
    const time = this.state.time;
    const grade = status === 'landed' ? this.judge.grade : 'crash';
    const score = computeScore({ mission: this.mission, outcome: status, grade, fuel: this.state.fuel, distance, time, difficulty: this.difficulty });
    this.outcome = {
      outcome: status,
      grade,
      reason: this.judge.reason,
      checks: this.judge.checks,
      fuel: this.state.fuel,
      distance,
      time,
      score,
      medal: status === 'landed' ? medalFor(this.mission, distance) : null,
    };
  }

  snapshot(alpha) {
    if (this.outcome) return this.state;
    return { ...this.state, r: lerp(this.prev.r, this.state.r, alpha), q: slerp(this.prev.q, this.state.q, alpha) };
  }

  result() {
    return this.outcome;
  }
}
