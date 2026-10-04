export class FixedStepLoop {
  constructor({ dt, maxSteps, step }) {
    this.dt = dt;
    this.maxSteps = maxSteps;
    this.stepFn = step;
    this.acc = 0;
    this.paused = false;
  }

  get alpha() {
    return Math.min(0.999999, this.acc / this.dt);
  }

  advance(elapsed) {
    if (this.paused) return { steps: 0, alpha: this.alpha };
    this.acc += Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) {
      this.stepFn(this.dt);
      this.acc -= this.dt;
      steps++;
    }
    if (this.acc >= this.dt) this.acc = 0; // spiral guard: drop what we could not simulate
    return { steps, alpha: this.alpha };
  }
}
