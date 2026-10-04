const DEG = Math.PI / 180;

export const CONFIG = {
  g0: 9.80665,
  physics: { dt: 1 / 120, maxStepsPerFrame: 8 },
  moon: { radius: 250000, gm: 1.0125e11 },
  rocket: {
    dryMass: 2000,
    height: 6,
    radius: 1.5,
    ringOffset: 3,          // thruster rings at ±3 m from the geometric centre
    mainTankZ: -1.5,        // hard-mode CoM contributors (body z, metres)
    rcsTankZ: 1.0,
    rcsMass: 60,
    maxThrust: 12000,
    ispMain: 311,
    minThrottle: 0.1,
    throttleTau: 0.8,
    throttleRateLimit: 0.6, // per second
    ignitionDelay: 0.5,
    thrusterForce: 400,
    thrusterTau: 0.05,
    ispRcs: 220,
    thrusterOnThreshold: 0.4,
  },
  legs: {
    // feet in body coordinates relative to the geometric centre, order: +X, -X, +Y, -Y
    feet: [[2.2, 0, -3.4], [-2.2, 0, -3.4], [0, 2.2, -3.4], [0, -2.2, -3.4]],
    stiffness: 40000,
    damping: 6000,
    frictionDamping: 4000,
    frictionCoeff: 0.8,
    contactCheckAgl: 12,
  },
  hullProbes: [
    [0, 0, 3], [0, 0, -3],
    [1.5, 0, -3], [-1.5, 0, -3], [0, 1.5, -3], [0, -1.5, -3],
    [1.5, 0, 0], [-1.5, 0, 0], [0, 1.5, 0], [0, -1.5, 0],
  ],
  sas: { rateThreshold: 0.5 * DEG },
  landing: {
    perfect: { vs: 1.0, hs: 0.5, tilt: 3, rate: 2, slope: 4 },
    safe: { vs: 2.5, hs: 1.5, tilt: 10, rate: 5, slope: 10 },
    settleTime: 3,
    hopResetTime: 1,
    tipOverTilt: 10,
  },
  predict: { dt: 0.1, maxTime: 120, interval: 0.1 },
  input: { throttleRate: 0.5 },
  terrain: {
    fbm: { octaves: 5, wavelength: 12000, amplitude: 250, lacunarity: 2, gain: 0.45 },
    // cell >= 4 * maxR keeps every feature inside the 3x3x3 neighbourhood search
    craters: [
      { cell: 8000, chance: 0.5, minR: 700, maxR: 2000 },
      { cell: 2000, chance: 0.45, minR: 150, maxR: 500 },
      { cell: 400, chance: 0.4, minR: 25, maxR: 100 },
      { cell: 80, chance: 0.35, minR: 4, maxR: 20 },
    ],
    crater: { depth: 0.2, rim: 0.04, rimWidth: 0.35 },
    boulders: { cell: 10, chance: 0.3, minR: 0.5, maxR: 2.0, fieldWavelength: 1500, fieldThreshold: 0.6 },
    pads: { cell: 800, chance: 0.35, minR: 40, maxR: 80, blend: 0.3 },
  },
};
