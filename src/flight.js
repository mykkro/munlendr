import { CONFIG } from './config.js';
import { FixedStepLoop } from './game/loop.js';
import { FlightSession } from './game/session.js';
import { mapControls, bodyControlFrame } from './game/input.js';
import { predictImpact, burnNowHeight } from './sim/predict.js';
import { PlanetRenderer } from './render/planet/planet-renderer.js';
import { createRocketModel, updateRocketModel } from './render/rocket-model.js';
import { Markers } from './render/markers.js';
import { Dust } from './render/dust.js';
import { Debris } from './render/debris.js';
import { CameraRig, controlFrame } from './render/cameras.js';
import { add, normalize, scale } from './math/vec3.js';

const LOAD_TIMEOUT_MS = 45000;
const END_DELAY = 2.5; // seconds between touchdown/crash and the results screen

export class Flight {
  constructor({ sceneRenderer, input, mission, difficulty, settings, hud = null, onEnd = () => {}, onPauseRequest = () => {} }) {
    this.sr = sceneRenderer;
    this.input = input;
    this.mission = mission;
    this.difficulty = difficulty;
    this.hud = hud;
    this.onEnd = onEnd;
    this.onPauseRequest = onPauseRequest;
    this.session = new FlightSession({ mission, difficulty });
    this.world = this.session.world;

    this.planet = new PlanetRenderer(this.sr.scene, { terrain: this.world.terrain, pads: this.world.pads });
    this.model = createRocketModel();
    this.sr.scene.add(this.model.root);
    this.markers = new Markers(this.sr.scene);
    this.markers.setTarget(this.world.sitePoint, this.world.siteDir, mission.targetPad.radius);
    this.markers.setPadHints(this.world.padHints);
    this.dust = new Dust(this.sr.scene);
    this.debris = new Debris(this.sr.scene);
    this.rig = new CameraRig();
    this.sr.setSunDirection(this.world.sunDir);
    this.applySettings(settings);

    this.command = { throttle: 0, rot: [0, 0], trans: [0, 0] };
    this.loop = new FixedStepLoop({
      dt: CONFIG.physics.dt,
      maxSteps: CONFIG.physics.maxStepsPerFrame,
      step: (dt) => this.session.step(dt, this.command),
    });
    this.ui = { aids: difficulty === 'easy', vehicleView: true, hudVisible: true };
    this.predictions = null;
    this.predictTimer = 0;
    this.running = false;
    this.paused = false;
    this.ended = false;
    this.reported = false;
    this.disposed = false;
    this.endTimer = 0;
    this.lastTime = null;
    this.frame = this.frame.bind(this);
    this.rig.updateHeading(this.session.state.r, this.session.state.v, 1);
  }

  applySettings(settings) {
    this.controlFrameMode = settings.controlFrame;
    this.rig.invertDrag = settings.invertDrag;
  }

  poseCtx(r) {
    return { rocketPos: r, siteDir: this.world.siteDir, sitePoint: this.world.sitePoint };
  }

  load(onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      let stable = 0;
      const tick = () => {
        if (this.disposed) return reject(new Error('cancelled'));
        if (this.planet.failed) return reject(new Error(this.planet.failed));
        const pose = this.rig.pose(this.poseCtx(this.session.state.r));
        const a = this.planet.update(pose.position);
        const b = this.planet.update(add(this.world.sitePoint, scale(this.world.siteDir, 30)));
        const pending = a.pending + b.pending;
        onProgress(pending);
        stable = pending === 0 ? stable + 1 : 0;
        if (stable >= 3) return resolve();
        if (performance.now() - start > LOAD_TIMEOUT_MS) return reject(new Error('The terrain took too long to load.'));
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  start() {
    this.running = true;
    this.input.reset(0);
    this.input.setEnabled(true);
    this.rig.attach(this.sr.renderer.domElement);
    this.lastTime = null;
    requestAnimationFrame(this.frame);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.loop.paused = true;
    this.input.setEnabled(false);
  }

  resume() {
    this.paused = false;
    this.loop.paused = false;
    this.lastTime = null;
    this.input.reset(this.input.throttle);
    this.input.setEnabled(!this.ended);
  }

  handleAction(a) {
    switch (a) {
      case 'sas': this.session.sas = !this.session.sas; break;
      case 'camera': this.rig.cycle(); break;
      case 'aids': if (this.session.aidsAvailable) this.ui.aids = !this.ui.aids; break;
      case 'vehicleView': this.ui.vehicleView = !this.ui.vehicleView; break;
      case 'hud': this.ui.hudVisible = !this.ui.hudVisible; break;
      case 'pause':
      case 'blur': if (!this.ended) this.onPauseRequest(); break;
      default: break;
    }
  }

  frame(now) {
    if (!this.running) return;
    const elapsed = this.lastTime == null ? 0 : (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(0.1, elapsed);
    const s = this.session;

    if (!this.paused) {
      const inp = this.input.update(dt);
      for (const a of inp.actions) this.handleAction(a);
      if (inp.look[0] || inp.look[1]) this.rig.orbit(inp.look[0] * 120 * dt, inp.look[1] * 80 * dt);
      if (!this.ended && !this.paused) {
        const pose = this.rig.pose(this.poseCtx(s.state.r));
        const frame = this.controlFrameMode === 'body' ? bodyControlFrame(s.state.q) : controlFrame(pose, s.state.r);
        const m = mapControls(inp.intent, frame, s.state.q);
        this.command = { throttle: inp.throttle, rot: m.rot, trans: m.trans };
        this.loop.advance(elapsed);
      }
    }

    if (s.outcome && !this.ended) {
      this.ended = true;
      this.input.setEnabled(false);
      if (s.outcome.outcome === 'crashed') {
        this.debris.explode(this.model, this.sr, { origin: s.state.r, velocity: s.state.v, up: normalize(s.state.r) });
      }
    }
    if (this.ended && !this.paused) {
      this.endTimer += dt;
      if (this.endTimer >= END_DELAY && !this.reported) {
        this.reported = true;
        this.onEnd(s.result());
      }
    }

    this.draw(this.paused ? 0 : dt, now / 1000);
    requestAnimationFrame(this.frame);
  }

  updatePredictions(dt, on) {
    if (!on || this.ended) {
      this.predictions = null;
      return;
    }
    this.predictTimer -= dt;
    if (this.predictions && this.predictTimer > 0) return;
    this.predictTimer = CONFIG.predict.interval;
    const st = this.session.state;
    this.predictions = { impact: predictImpact(st, this.world.body), burnNow: burnNowHeight(st, this.world.body) };
  }

  draw(dt, time) {
    const s = this.session;
    const snap = s.snapshot(this.loop.alpha);
    if (dt > 0) this.rig.updateHeading(snap.r, snap.v, dt);
    const pose = this.rig.pose(this.poseCtx(snap.r));
    this.sr.setCamera(pose);
    this.planet.update(pose.position);

    const up = normalize(snap.r);
    const groundPoint = this.world.body.surfacePoint(up);
    const zcm = s.lastStep?.zcm ?? 0;
    if (s.outcome?.outcome !== 'crashed') {
      updateRocketModel(this.model, {
        renderPos: this.sr.toRender(snap.r), q: snap.q, zcm,
        engineOn: snap.engineOn, throttle: snap.throttle, thrusters: snap.thrusters, time,
      });
    }

    const aidsOn = this.ui.aids && s.aidsAvailable;
    this.updatePredictions(dt, aidsOn);
    const impact = aidsOn && this.predictions?.impact ? { point: this.predictions.impact.point, up: normalize(this.predictions.impact.point) } : null;
    this.markers.update(this.sr, { rocketPos: snap.r, groundPoint, up, impact });
    const agl = this.world.body.agl(snap.r);
    this.dust.update(dt, this.sr, {
      active: snap.engineOn && agl < 20 && dt > 0,
      groundPoint, up, intensity: snap.throttle * Math.max(0, 1 - agl / 20),
    });
    this.debris.update(dt, this.sr, this.world.body);
    this.sr.render();
  }

  dispose() {
    this.running = false;
    this.disposed = true;
    this.input.setEnabled(false);
    this.rig.detach();
    this.planet.dispose();
    this.sr.scene.remove(this.model.root);
    this.markers.dispose();
    this.dust.dispose();
    this.debris.dispose();
  }
}
