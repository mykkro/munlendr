# Lunar Lander — Missions 1–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable 3D toon-shaded browser lunar lander (missions 1–2 on a procedural small moon) with the full physics, controls, cameras, HUD, progression and localStorage persistence described in the spec.

**Architecture:** A pure, float64, Node-testable simulation (`src/sim`, `src/math`, most of `src/game`) that never imports Three.js or touches the DOM; a Three.js renderer (`src/render`) using a floating origin, a quadtree cube-sphere LOD planet built in Web Workers from the same terrain function the physics uses, and a cel/outline post pass; a DOM/canvas HUD (`src/hud`) and DOM screens (`src/ui`) wired together by `src/flight.js` and `src/main.js`.

**Tech Stack:** Plain ES modules, no build step; Three.js 0.170.0 vendored in `vendor/three/`; Node 24 built-in `node:test` for tests; any static server (`npm run serve`).

**Spec:** `docs/superpowers/specs/2026-10-04-lunar-lander-missions-1-2-design.md` (implements `docs/specs/Lunar Lander – Physics & Controls Design.pdf` for missions 1–2).

## Global Constraints

- Pure static HTML/CSS/JS ES modules; no backend; no build step; no runtime npm dependencies.
- Three.js vendored under `vendor/three/` and loaded via an import map (`"three": "./vendor/three/three.module.js"`).
- `src/sim/` and `src/math/` never import Three.js and never touch the DOM.
- Physics: fixed dt = 1/120 s; max 8 steps per frame; excess time dropped.
- Small moon: R = 250 000 m, GM = 1.0125×10¹¹ m³/s² (surface g = 1.62 m/s²).
- Rocket: dry 2000 kg, 6 m tall, 1.5 m radius, 12 kN, Isp 311 s, throttle 10–100 %, τ 0.8 s, rate limit 60 %/s, ignition 0.5 s, 8 × 400 N thrusters at ±3 m, 0.05 s response, RCS Isp 220 s, RCS 60 kg.
- Landing grades: Perfect/Safe/Crash thresholds — vertical <1.0/<2.5, horizontal <0.5/<1.5 m/s, tilt <3/<10°, rate <2/<5 °/s, slope <4/<10°; settle 3 s engine off; hop reset after 1 s airborne.
- localStorage key `munlendr.v1`; history keeps the last 10 attempts; failures fall back to defaults.
- Tests: `node --test "tests/**/*.test.js"` (no test dependencies).
- Target: current desktop Chrome, Firefox, Edge with WebGL2 and module workers.

## Review Focus

1. Holding Ctrl (throttle down) while pressing W/S/D triggers browser shortcuts (Ctrl+W closes the tab, Ctrl+S saves, Ctrl+D bookmarks): the game must `preventDefault` every Ctrl combo during flight, offer R/F as alternative throttle keys, and guard with `beforeunload` while flying — test in Task 12, guard in Task 19.
2. Alt-tabbing or clicking outside while holding a key leaves it "stuck" (no keyup arrives): all held keys must be released on window blur and the flight auto-paused — test in Task 12.
3. A hidden tab or a multi-second frame gap must not explode the simulation or fast-forward it: at most 8 steps run and the remainder is dropped — test in Task 9.
4. Running out of propellant in the middle of a step must never leave negative fuel/RCS or keep producing thrust — test in Task 6.
5. Touching down and leaving the engine running must not silently hang: the rocket stays in "touchdown" (never lands) and the HUD tells the player to cut the engine — tests in Task 7 (judge) and Task 18 (message).

## File Map

```
package.json, .gitignore, README.md
index.html, styles.css
vendor/three/three.module.js (+ three.core.js if the build imports it)
src/config.js
src/math/vec3.js, src/math/quat.js
src/sim/terrain.js, frame.js, body.js, rocket.js, actuators.js, sas.js, physics.js, contact.js, predict.js
src/game/loop.js, missions.js, storage.js, input.js, session.js, telemetry.js
src/render/toon.js, scene.js, rocket-model.js, plumes.js, markers.js, dust.js, debris.js, cameras.js
src/render/planet/cubesphere.js, quadtree.js, chunk-builder.js, chunk-worker.js, planet-renderer.js
src/hud/format.js, hud.js, attitude-ball.js, nav-map.js, vehicle-view.js
src/ui/screens.js
src/flight.js, src/main.js
tests/*.test.js
```

Conventions used everywhere: vectors are `[x, y, z]` arrays of float64; quaternions are `[w, x, y, z]` and rotate body → world; body +Z is the rocket's long axis (engine pushes +Z); body +X is "forward". Angles in the sim are radians; HUD values are degrees.

---

### Task 1: Project scaffold, vendored Three.js, vector and quaternion math

**Files:**
- Create: `package.json`, `.gitignore`, `vendor/three/three.module.js`, `src/math/vec3.js`, `src/math/quat.js`
- Test: `tests/math.test.js`

**Interfaces:**
- Produces: `vec3.js` exports `add, sub, scale, addScaled, dot, cross, length, normalize, lerp, distance, angleBetween, DEG`; `quat.js` exports `identity, multiply, conjugate, normalize, rotate, integrate(q, wBody, dt), fromAxisAngle(axis, angle), fromBasis(xAxis, yAxis, zAxis), slerp(a, b, t)`.

- [ ] **Step 1: Create `package.json` and `.gitignore`**

```json
{
  "name": "munlendr",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\"",
    "serve": "npx --yes serve -l 8080 ."
  }
}
```

`.gitignore`:
```
node_modules/
.DS_Store
```

- [ ] **Step 2: Vendor Three.js 0.170.0**

```bash
mkdir -p vendor/three
curl -fsSL https://unpkg.com/three@0.170.0/build/three.module.js -o vendor/three/three.module.js
grep -q "three.core.js" vendor/three/three.module.js && curl -fsSL https://unpkg.com/three@0.170.0/build/three.core.js -o vendor/three/three.core.js || true
ls -la vendor/three
```
Expected: `three.module.js` is ~1.2 MB (plus `three.core.js` only if the module imports it).

- [ ] **Step 3: Write the failing test `tests/math.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/math/vec3.js';
import * as Q from '../src/math/quat.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const closeV = (a, b, eps = 1e-9) => a.forEach((x, i) => close(x, b[i], eps));

test('vec3 basics', () => {
  closeV(V.add([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
  closeV(V.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  close(V.length([3, 4, 0]), 5);
  closeV(V.normalize([0, 0, 5]), [0, 0, 1]);
  closeV(V.normalize([0, 0, 0]), [0, 0, 0]);
  close(V.angleBetween([1, 0, 0], [0, 1, 0]), Math.PI / 2);
  closeV(V.addScaled([1, 1, 1], [1, 2, 3], 2), [3, 5, 7]);
});

test('quat rotate 90 degrees about Z maps X to Y', () => {
  const q = Q.fromAxisAngle([0, 0, 1], Math.PI / 2);
  closeV(Q.rotate(q, [1, 0, 0]), [0, 1, 0], 1e-12);
});

test('fromBasis: identity and round trip', () => {
  closeV(Q.fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1]), [1, 0, 0, 0]);
  const q = Q.fromAxisAngle(V.normalize([1, 2, 3]), 1.1);
  const q2 = Q.fromBasis(Q.rotate(q, [1, 0, 0]), Q.rotate(q, [0, 1, 0]), Q.rotate(q, [0, 0, 1]));
  const d = Math.abs(q.reduce((s, c, i) => s + c * q2[i], 0));
  close(d, 1, 1e-9);
});

test('integrate body rate about +X by 90 degrees tips +Z to -Y', () => {
  let q = Q.identity();
  const steps = 1000, dt = (Math.PI / 2) / steps;
  for (let i = 0; i < steps; i++) q = Q.integrate(q, [1, 0, 0], dt);
  closeV(Q.rotate(q, [0, 0, 1]), [0, -1, 0], 1e-3);
});

test('slerp halfway', () => {
  const h = Q.slerp(Q.identity(), Q.fromAxisAngle([0, 0, 1], Math.PI / 2), 0.5);
  closeV(Q.rotate(h, [1, 0, 0]), [Math.SQRT1_2, Math.SQRT1_2, 0], 1e-9);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/math/vec3.js'`.

- [ ] **Step 5: Implement `src/math/vec3.js`**

```js
export const DEG = Math.PI / 180;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
export function normalize(a) {
  const l = length(a);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const distance = (a, b) => length(sub(a, b));
export function angleBetween(a, b) {
  const la = length(a), lb = length(b);
  if (la === 0 || lb === 0) return 0;
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b) / (la * lb))));
}
```

- [ ] **Step 6: Implement `src/math/quat.js`**

```js
// Quaternions are [w, x, y, z] and rotate body-frame vectors into the world frame.
export const identity = () => [1, 0, 0, 0];

export function multiply(a, b) {
  const [aw, ax, ay, az] = a, [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export const conjugate = (q) => [q[0], -q[1], -q[2], -q[3]];

export function normalize(q) {
  const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return l > 0 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : identity();
}

export function rotate(q, v) {
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

// Body-frame angular velocity: q' = q + 0.5 * q ⊗ (0, ω) * dt, then re-normalised.
export function integrate(q, wBody, dt) {
  const d = multiply(q, [0, wBody[0], wBody[1], wBody[2]]);
  return normalize([q[0] + 0.5 * d[0] * dt, q[1] + 0.5 * d[1] * dt, q[2] + 0.5 * d[2] * dt, q[3] + 0.5 * d[3] * dt]);
}

export function fromAxisAngle(axis, angle) {
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s];
}

// Columns of the body→world rotation matrix are the world images of body X, Y, Z.
export function fromBasis(X, Y, Z) {
  const m00 = X[0], m10 = X[1], m20 = X[2];
  const m01 = Y[0], m11 = Y[1], m21 = Y[2];
  const m02 = Z[0], m12 = Z[1], m22 = Z[2];
  const tr = m00 + m11 + m22;
  let w, x, y, z;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  return normalize([w, x, y, z]);
}

export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) {
    return normalize([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json .gitignore vendor src/math tests/math.test.js
git commit -m "feat: project scaffold, vendored three.js, vector and quaternion math"
```

---

### Task 2: Config and seeded terrain height function

**Files:**
- Create: `src/config.js`, `src/sim/terrain.js`
- Test: `tests/terrain.test.js`

**Interfaces:**
- Consumes: `vec3.js` (Task 1).
- Produces: `CONFIG` (all constants used by later tasks); `createTerrain({ seed, radius, pads = [], params = CONFIG.terrain })` → `{ seed, radius, height(dir) → metres above radius, rawHeight(dir), padsNear(dir, rangeMeters) → [{ dir, radius, height }] }`. `pads` entries are `{ dir: [x,y,z] unit, radius: metres }` (plain data, so they can be posted to a worker). Also exports `hash01(x, y, z, seed)`, `valueNoise(x, y, z, seed)`.

- [ ] **Step 1: Create `src/config.js`** (complete; later tasks only read it)

```js
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
```

- [ ] **Step 2: Write the failing test `tests/terrain.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/sim/terrain.js';
import { normalize, add, scale, cross } from '../src/math/vec3.js';

const R = 250000;
function randomDirs(n, seed = 1) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => normalize([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
}
function nudge(dir, meters) {
  const t = normalize(cross(dir, [0.3, 0.5, 0.8]));
  return normalize(add(dir, scale(t, meters / R)));
}

test('deterministic for the same seed, different for another seed', () => {
  const a = createTerrain({ seed: 7, radius: R });
  const b = createTerrain({ seed: 7, radius: R });
  const c = createTerrain({ seed: 8, radius: R });
  const dirs = randomDirs(50);
  dirs.forEach((d) => assert.equal(a.height(d), b.height(d)));
  assert.ok(dirs.some((d) => a.height(d) !== c.height(d)));
});

test('continuous: 5 cm apart never differs by more than 0.2 m', () => {
  const t = createTerrain({ seed: 3, radius: R });
  for (const d of randomDirs(300, 9)) {
    assert.ok(Math.abs(t.height(d) - t.height(nudge(d, 0.05))) < 0.2);
  }
});

test('bounded heights', () => {
  const t = createTerrain({ seed: 11, radius: R });
  for (const d of randomDirs(500, 5)) assert.ok(Math.abs(t.height(d)) < 3000);
});

test('explicit pad is perfectly flat inside its inner radius', () => {
  const site = normalize([0.4, 0.3, 0.86]);
  const t = createTerrain({ seed: 5, radius: R, pads: [{ dir: site, radius: 60 }] });
  const h0 = t.height(site);
  for (const m of [5, 20, 40]) assert.ok(Math.abs(t.height(nudge(site, m)) - h0) < 1e-9);
});

test('padsNear finds procedural pads that are flat at their centre', () => {
  const t = createTerrain({ seed: 21, radius: R });
  const pads = t.padsNear(normalize([0.1, 0.9, 0.2]), 5000);
  assert.ok(pads.length > 0);
  const p = pads[0];
  assert.ok(Math.abs(t.height(nudge(p.dir, p.radius * 0.3)) - t.height(p.dir)) < 1e-9);
});

test('fast enough for chunk building', () => {
  const t = createTerrain({ seed: 2, radius: R });
  const dirs = randomDirs(20000, 4);
  const start = performance.now();
  for (const d of dirs) t.height(d);
  assert.ok(performance.now() - start < 3000);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/sim/terrain.js'`.

- [ ] **Step 4: Implement `src/sim/terrain.js`**

```js
import { CONFIG } from '../config.js';
import { normalize } from '../math/vec3.js';

export function hash01(x, y, z, seed) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function valueNoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const c000 = hash01(ix, iy, iz, seed), c100 = hash01(ix + 1, iy, iz, seed);
  const c010 = hash01(ix, iy + 1, iz, seed), c110 = hash01(ix + 1, iy + 1, iz, seed);
  const c001 = hash01(ix, iy, iz + 1, seed), c101 = hash01(ix + 1, iy, iz + 1, seed);
  const c011 = hash01(ix, iy + 1, iz + 1, seed), c111 = hash01(ix + 1, iy + 1, iz + 1, seed);
  const x00 = c000 + (c100 - c000) * fx, x10 = c010 + (c110 - c010) * fx;
  const x01 = c001 + (c101 - c001) * fx, x11 = c011 + (c111 - c011) * fx;
  const y0 = x00 + (x10 - x00) * fy, y1 = x01 + (x11 - x01) * fy;
  return y0 + (y1 - y0) * fz;
}

function fbm(p, f, seed) {
  let sum = 0, amp = f.amplitude, freq = 1 / f.wavelength;
  for (let o = 0; o < f.octaves; o++) {
    sum += amp * (2 * valueNoise(p[0] * freq, p[1] * freq, p[2] * freq, seed + o * 131) - 1);
    amp *= f.gain;
    freq *= f.lacunarity;
  }
  return sum;
}

function craterProfile(d, r, c) {
  if (d >= 2) return 0;
  const rim = c.rim * r;
  if (d < 1) return c.depth * r * (d * d - 1) + rim * d ** 6;
  const t = (d - 1) / c.rimWidth;
  return rim * Math.exp(-t * t);
}

// Visits seeded features (one optional feature per 3D cell) whose centre is projected onto the sphere.
function forEachFeature(p, cls, seed, radius, fn) {
  const cell = cls.cell;
  const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const ix = cx + dx, iy = cy + dy, iz = cz + dz;
    if (hash01(ix, iy, iz, seed) >= cls.chance) continue;
    const c0 = (ix + hash01(ix, iy, iz, seed + 1)) * cell;
    const c1 = (iy + hash01(ix, iy, iz, seed + 2)) * cell;
    const c2 = (iz + hash01(ix, iy, iz, seed + 3)) * cell;
    const cl = Math.sqrt(c0 * c0 + c1 * c1 + c2 * c2);
    if (Math.abs(cl - radius) > cell * 0.5) continue;
    const s = radius / cl;
    const e0 = c0 * s, e1 = c1 * s, e2 = c2 * s;
    const r = cls.minR + (cls.maxR - cls.minR) * hash01(ix, iy, iz, seed + 4);
    const dist = Math.sqrt((p[0] - e0) ** 2 + (p[1] - e1) ** 2 + (p[2] - e2) ** 2);
    fn(dist, r, [e0, e1, e2], ix, iy, iz);
  }
}

function blendPad(h, padHeight, dist, r, blend) {
  if (dist >= r) return h;
  const inner = r * (1 - blend);
  const w = dist <= inner ? 1 : 1 - smoothstep(inner, r, dist);
  return h + (padHeight - h) * w;
}

export function createTerrain({ seed, radius, pads = [], params = CONFIG.terrain }) {
  const P = params;
  const padCache = new Map();

  function rawHeight(dir) {
    const p = [dir[0] * radius, dir[1] * radius, dir[2] * radius];
    let h = fbm(p, P.fbm, seed);
    P.craters.forEach((cls, k) => {
      forEachFeature(p, cls, seed + 1000 * (k + 1), radius, (dist, r) => { h += craterProfile(dist / r, r, P.crater); });
    });
    const b = P.boulders;
    const field = valueNoise(p[0] / b.fieldWavelength, p[1] / b.fieldWavelength, p[2] / b.fieldWavelength, seed + 7777);
    const fw = smoothstep(b.fieldThreshold, b.fieldThreshold + 0.08, field);
    if (fw > 0) {
      forEachFeature(p, b, seed + 9000, radius, (dist, r) => {
        const d = dist / r;
        if (d < 1) h += fw * 0.6 * r * (1 - d * d) ** 1.5;
      });
    }
    return h;
  }

  const explicit = pads.map((pad) => {
    const dir = normalize(pad.dir);
    return { dir, radius: pad.radius, point: [dir[0] * radius, dir[1] * radius, dir[2] * radius], height: rawHeight(dir) };
  });

  function padHeightFor(center, ix, iy, iz) {
    const key = `${ix},${iy},${iz}`;
    let ph = padCache.get(key);
    if (ph === undefined) { ph = rawHeight(normalize(center)); padCache.set(key, ph); }
    return ph;
  }

  function height(dir) {
    const p = [dir[0] * radius, dir[1] * radius, dir[2] * radius];
    let h = rawHeight(dir);
    forEachFeature(p, P.pads, seed + 5000, radius, (dist, r, center, ix, iy, iz) => {
      if (dist < r) h = blendPad(h, padHeightFor(center, ix, iy, iz), dist, r, P.pads.blend);
    });
    for (const pad of explicit) {
      const dist = Math.sqrt((p[0] - pad.point[0]) ** 2 + (p[1] - pad.point[1]) ** 2 + (p[2] - pad.point[2]) ** 2);
      h = blendPad(h, pad.height, dist, pad.radius, P.pads.blend);
    }
    return h;
  }

  function padsNear(dir, range) {
    const cls = P.pads, cell = cls.cell, s = seed + 5000;
    const p = [dir[0] * radius, dir[1] * radius, dir[2] * radius];
    const n = Math.ceil(range / cell) + 1;
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
    const out = [];
    for (let dx = -n; dx <= n; dx++) for (let dy = -n; dy <= n; dy++) for (let dz = -n; dz <= n; dz++) {
      const ix = cx + dx, iy = cy + dy, iz = cz + dz;
      if (hash01(ix, iy, iz, s) >= cls.chance) continue;
      const c = [(ix + hash01(ix, iy, iz, s + 1)) * cell, (iy + hash01(ix, iy, iz, s + 2)) * cell, (iz + hash01(ix, iy, iz, s + 3)) * cell];
      const cl = Math.sqrt(c[0] ** 2 + c[1] ** 2 + c[2] ** 2);
      if (Math.abs(cl - radius) > cell * 0.5) continue;
      const center = [c[0] * radius / cl, c[1] * radius / cl, c[2] * radius / cl];
      const dist = Math.sqrt((p[0] - center[0]) ** 2 + (p[1] - center[1]) ** 2 + (p[2] - center[2]) ** 2);
      if (dist > range) continue;
      const r = cls.minR + (cls.maxR - cls.minR) * hash01(ix, iy, iz, s + 4);
      out.push({ dir: normalize(center), radius: r, height: padHeightFor(center, ix, iy, iz), distance: dist });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  return { seed, radius, height, rawHeight, padsNear };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. If "padsNear finds procedural pads" fails with an empty list, raise the range in the test to 8000 (pad density is `chance / cell²`), never the pad chance.

- [ ] **Step 6: Commit**

```bash
git add src/config.js src/sim/terrain.js tests/terrain.test.js
git commit -m "feat: config constants and seeded terrain height function"
```

---

### Task 3: Local frames and the planet body

**Files:**
- Create: `src/sim/frame.js`, `src/sim/body.js`
- Test: `tests/body.test.js`

**Interfaces:**
- Consumes: `vec3.js`, `createTerrain`.
- Produces:
  - `frame.js`: `latLonToDir(latDeg, lonDeg)`, `tangentBasis(up) → { east, north, up }`, `offsetDirection(dir, eastM, northM, radius) → dir`, `surfaceOffset(fromDir, toDir, radius) → { east, north, distance }` (metres of `toDir` relative to `fromDir`, in `fromDir`'s tangent frame), `bearingDeg(east, north) → 0..360` (0 = north, 90 = east).
  - `body.js`: `createBody({ radius, gm, terrain })` → `{ radius, gm, terrain, gravity(r), altitude(r), surfaceRadius(dir), surfacePoint(dir), agl(r), normal(dir), slopeDeg(dir) }`.

- [ ] **Step 1: Write the failing test `tests/body.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBody } from '../src/sim/body.js';
import { createTerrain } from '../src/sim/terrain.js';
import { latLonToDir, tangentBasis, offsetDirection, surfaceOffset, bearingDeg } from '../src/sim/frame.js';
import { length, scale, dot } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const R = CONFIG.moon.radius;
const flat = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('surface gravity is 1.62 m/s^2 toward the centre', () => {
  const r = scale(latLonToDir(10, 20), R);
  const g = flat.gravity(r);
  close(length(g), 1.62, 1e-9);
  assert.ok(dot(g, r) < 0);
});

test('agl and altitude on flat terrain', () => {
  const r = scale(latLonToDir(-5, 40), R + 123);
  close(flat.agl(r), 123, 1e-6);
  close(flat.altitude(r), 123, 1e-6);
});

test('tangent basis is right-handed east/north/up', () => {
  const up = latLonToDir(0, 0);
  const { east, north } = tangentBasis(up);
  close(east[1], 1, 1e-12);
  close(north[2], 1, 1e-12);
  const pole = tangentBasis([0, 0, 1]);
  close(length(pole.east), 1, 1e-12);
});

test('offsetDirection and surfaceOffset are inverses', () => {
  const site = latLonToDir(8, 23);
  const d = offsetDirection(site, -1200, 300, R);
  const o = surfaceOffset(site, d, R);
  close(o.east, -1200, 0.05);
  close(o.north, 300, 0.05);
  close(o.distance, Math.hypot(1200, 300), 0.05);
});

test('bearing: north 0, east 90, south 180, west 270', () => {
  close(bearingDeg(0, 1), 0, 1e-9);
  close(bearingDeg(1, 0), 90, 1e-9);
  close(bearingDeg(0, -1), 180, 1e-9);
  close(bearingDeg(-1, 0), 270, 1e-9);
});

test('normal on a flat pad is vertical; slope is near zero', () => {
  const site = latLonToDir(8, 23);
  const body = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: createTerrain({ seed: 1969, radius: R, pads: [{ dir: site, radius: 60 }] }) });
  assert.ok(body.slopeDeg(site) < 0.05);
  close(dot(body.normal(site), site), 1, 1e-6);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/sim/body.js'`.

- [ ] **Step 3: Implement `src/sim/frame.js`**

```js
import { add, cross, dot, length, normalize, scale, sub, angleBetween, DEG } from '../math/vec3.js';

export function latLonToDir(latDeg, lonDeg) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

export function tangentBasis(up) {
  let e = cross([0, 0, 1], up);
  if (length(e) < 1e-9) e = [1, 0, 0];
  const east = normalize(e);
  const north = cross(up, east);
  return { east, north, up };
}

export function offsetDirection(dir, eastM, northM, radius) {
  const { east, north } = tangentBasis(dir);
  const t = add(scale(east, eastM), scale(north, northM));
  const dist = length(t);
  if (dist === 0) return dir.slice();
  const axis = scale(t, 1 / dist), ang = dist / radius;
  return normalize(add(scale(dir, Math.cos(ang)), scale(axis, Math.sin(ang))));
}

export function surfaceOffset(fromDir, toDir, radius) {
  const distance = angleBetween(fromDir, toDir) * radius;
  const t = sub(toDir, scale(fromDir, dot(toDir, fromDir)));
  const tl = length(t);
  if (tl < 1e-12) return { east: 0, north: 0, distance: 0 };
  const { east, north } = tangentBasis(fromDir);
  return { east: distance * dot(t, east) / tl, north: distance * dot(t, north) / tl, distance };
}

export function bearingDeg(east, north) {
  return (Math.atan2(east, north) / DEG + 360) % 360;
}
```

- [ ] **Step 4: Implement `src/sim/body.js`**

```js
import { add, cross, dot, length, normalize, scale, sub, angleBetween, DEG } from '../math/vec3.js';
import { tangentBasis } from './frame.js';

const NORMAL_STEP = 0.5; // metres

export function createBody({ radius, gm, terrain }) {
  const surfaceRadius = (dir) => radius + terrain.height(dir);
  const surfacePoint = (dir) => scale(dir, surfaceRadius(dir));

  function normal(dir) {
    const { east, north } = tangentBasis(dir);
    const a = NORMAL_STEP / radius;
    const at = (e, n) => surfacePoint(normalize(add(dir, add(scale(east, e * a), scale(north, n * a)))));
    const n = normalize(cross(sub(at(1, 0), at(-1, 0)), sub(at(0, 1), at(0, -1))));
    return dot(n, dir) < 0 ? scale(n, -1) : n;
  }

  return {
    radius,
    gm,
    terrain,
    gravity(r) {
      const d = length(r);
      return scale(r, -gm / (d * d * d));
    },
    altitude: (r) => length(r) - radius,
    surfaceRadius,
    surfacePoint,
    agl: (r) => length(r) - surfaceRadius(normalize(r)),
    normal,
    slopeDeg: (dir) => angleBetween(normal(dir), dir) / DEG,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/frame.js src/sim/body.js tests/body.test.js
git commit -m "feat: local east/north/up frames and planet body (gravity, AGL, normals)"
```

---

### Task 4: Rocket state, mass, centre of mass and inertia

**Files:**
- Create: `src/sim/rocket.js`
- Test: `tests/rocket.test.js`

**Interfaces:**
- Consumes: `CONFIG`, `quat.rotate`.
- Produces: `createRocketState({ position, velocity, orientation, fuel, rcs })` → state `{ r, v, q, w, fuel, rcs, throttle, engineOn, ignition, thrusters: number[8], time }`; `cloneState(s)`; `totalMass(s, rc?)`; `centerOfMassZ(s, difficulty, rc?)` (`'easy'` → 0); `leverArms(zcm, rc?) → { top, bottom }`; `transverseInertia(s, difficulty, rc?)`; `deltaVRemaining(s, rc?, g0?)`; `bodyAxis(s)` (world direction of body +Z).

- [ ] **Step 1: Write the failing test `tests/rocket.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRocketState, cloneState, totalMass, centerOfMassZ, leverArms, transverseInertia, deltaVRemaining } from '../src/sim/rocket.js';
import { CONFIG } from '../src/config.js';

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const make = (fuel, rcs = 60) => createRocketState({ position: [0, 0, 1], velocity: [0, 0, 0], orientation: [1, 0, 0, 0], fuel, rcs });

test('mass is dry + fuel + rcs', () => {
  assert.equal(totalMass(make(700)), 2760);
});

test('easy mode CoM fixed at the centre; hard mode CoM rises as fuel burns', () => {
  assert.equal(centerOfMassZ(make(700), 'easy'), 0);
  close(centerOfMassZ(make(700), 'hard'), (700 * -1.5 + 60 * 1.0) / 2760, 1e-12);
  assert.ok(centerOfMassZ(make(100), 'hard') > centerOfMassZ(make(700), 'hard'));
  const arms = leverArms(-0.36);
  close(arms.top, 3.36, 1e-12);
  close(arms.bottom, 2.64, 1e-12);
});

test('inertia matches the solid cylinder; one pair gives about 11 deg/s^2 at 3500 kg', () => {
  const s = make(1440);
  close(transverseInertia(s, 'easy'), 3500 * (3 * 1.5 ** 2 + 36) / 12, 1e-9);
  const alpha = (2 * CONFIG.rocket.thrusterForce * 3) / transverseInertia(s, 'easy');
  close(alpha * 180 / Math.PI, 11.03, 0.05);
});

test('remaining delta-v follows the rocket equation', () => {
  const s = make(700);
  close(deltaVRemaining(s), 311 * 9.80665 * Math.log(2760 / 2060), 1e-9);
});

test('cloneState is deep for arrays', () => {
  const s = make(500);
  const c = cloneState(s);
  c.r[0] = 99; c.thrusters[3] = 1;
  assert.equal(s.r[0], 0);
  assert.equal(s.thrusters[3], 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/sim/rocket.js'`.

- [ ] **Step 3: Implement `src/sim/rocket.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rocket.js tests/rocket.test.js
git commit -m "feat: rocket state, mass, centre of mass and inertia"
```

---

### Task 5: Actuators — main engine and eight side thrusters

**Files:**
- Create: `src/sim/actuators.js`
- Test: `tests/actuators.test.js`

**Interfaces:**
- Consumes: `CONFIG`, `vec3.cross`, rocket state shape (Task 4).
- Produces: `THRUSTERS` (index → `{ ring: 'top'|'bottom', axis: 0|1, sign: ±1 }`; order top +X, top −X, top +Y, top −Y, bottom +X, bottom −X, bottom +Y, bottom −Y); `mixThrusters(rot: [x, y], trans: [x, y], threshold?) → boolean[8]` (`rot[0]` = desired torque about body +X, `rot[1]` about body +Y; `trans` = desired body-frame force direction); `updateEngine(s, throttleCmd, dt, rc?) → thrust N` (mutates `s.throttle`, `s.engineOn`, `s.ignition`); `updateThrusters(s, commands, dt, rc?)` (mutates `s.thrusters`); `thrusterForcesAndTorque(s, zcm, rc?) → { force, torque }` (body frame, torque about the CoM); `engineThrust(s, rc?)`; `propellantFlow(s, rc?, g0?) → { main, rcs }` kg/s.

- [ ] **Step 1: Write the failing test `tests/actuators.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixThrusters, updateEngine, updateThrusters, thrusterForcesAndTorque, propellantFlow } from '../src/sim/actuators.js';
import { createRocketState } from '../src/sim/rocket.js';
import { CONFIG } from '../src/config.js';

const dt = 1 / 120;
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const make = (fuel = 500) => createRocketState({ position: [0, 0, 1], velocity: [0, 0, 0], orientation: [1, 0, 0, 0], fuel });
const run = (s, cmd, seconds) => { let t = 0; for (let i = 0; i < Math.round(seconds / dt); i++) t = updateEngine(s, cmd, dt); return t; };

test('ignition delay of 0.5 s from off', () => {
  const s = make();
  assert.equal(run(s, 1, 59 * dt), 0);
  assert.ok(run(s, 1, 3 * dt) > 0);
  assert.equal(s.engineOn, true);
});

test('commands below 10% never ignite', () => {
  const s = make();
  assert.equal(run(s, 0.05, 2), 0);
  assert.equal(s.engineOn, false);
});

test('rate limit of 60%/s right after ignition, then lag towards the command', () => {
  const s = make();
  run(s, 1, 0.5 + 2 * dt);
  run(s, 1, 0.5);
  close(s.throttle, 0.4, 0.02);
  run(s, 1, 6);
  assert.ok(s.throttle > 0.99);
});

test('cut to zero winds down and switches off', () => {
  const s = make();
  run(s, 0.5, 4);
  assert.equal(s.engineOn, true);
  run(s, 0, 2);
  assert.equal(s.engineOn, false);
  assert.equal(s.throttle, 0);
});

test('no fuel means no thrust', () => {
  const s = make(0);
  assert.equal(run(s, 1, 2), 0);
  assert.equal(s.engineOn, false);
});

test('rotation pair: forces cancel, torques add (easy)', () => {
  const s = make();
  s.thrusters = mixThrusters([0, 1], [0, 0]).map((on) => (on ? 1 : 0));
  const { force, torque } = thrusterForcesAndTorque(s, 0);
  force.forEach((f) => close(f, 0, 1e-9));
  close(torque[1], 2 * 400 * 3, 1e-9);
  const sx = make();
  sx.thrusters = mixThrusters([1, 0], [0, 0]).map((on) => (on ? 1 : 0));
  close(thrusterForcesAndTorque(sx, 0).torque[0], 2400, 1e-9);
});

test('translation pair: torques cancel in easy, residual in hard', () => {
  const s = make();
  s.thrusters = mixThrusters([0, 0], [1, 0]).map((on) => (on ? 1 : 0));
  const easy = thrusterForcesAndTorque(s, 0);
  close(easy.force[0], 800, 1e-9);
  easy.torque.forEach((t) => close(t, 0, 1e-9));
  const hard = thrusterForcesAndTorque(s, -0.36);
  assert.ok(Math.abs(hard.torque[1]) > 1);
});

test('thrusters reach 63% in 50 ms and stop without RCS', () => {
  const s = make();
  const on = [true, false, false, false, false, false, false, false];
  for (let i = 0; i < 6; i++) updateThrusters(s, on, dt);
  close(s.thrusters[0], 1 - Math.exp(-1), 0.01);
  s.rcs = 0;
  updateThrusters(s, on, dt);
  assert.equal(s.thrusters[0], 0);
});

test('propellant flow from thrust and Isp', () => {
  const s = make();
  s.engineOn = true; s.throttle = 1; s.thrusters[0] = 1;
  const f = propellantFlow(s);
  close(f.main, 12000 / (311 * CONFIG.g0), 1e-12);
  close(f.rcs, 400 / (220 * CONFIG.g0), 1e-12);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/sim/actuators.js'`.

- [ ] **Step 3: Implement `src/sim/actuators.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/actuators.js tests/actuators.test.js
git commit -m "feat: main engine lag/ignition and eight-thruster mixing"
```

---

### Task 6: Stability assist and the physics step

**Files:**
- Create: `src/sim/sas.js`, `src/sim/physics.js`
- Test: `tests/physics.test.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `sasCommand(w, sasCfg?) → [x, y]` rotation command; `step(s, cmd, env, dt) → { thrust, thrusterCommands, contact, zcm, mass }` where `cmd = { throttle, rot: [x, y], trans: [x, y], sas: boolean }` (missing fields default to 0/false) and `env = { body, difficulty: 'easy'|'hard', cfg?: CONFIG, contacts?: boolean }`. Mutates `s`. `contact` is `null` in this task; Task 7 fills it.

- [ ] **Step 1: Write the failing test `tests/physics.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/physics.js';
import { sasCommand } from '../src/sim/sas.js';
import { createRocketState, totalMass } from '../src/sim/rocket.js';
import { createBody } from '../src/sim/body.js';
import { length, scale, sub, dot } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const dt = 1 / 120;
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const space = createBody({ radius: 1000, gm: 0, terrain: { height: () => 0 } });
const moon = createBody({ radius: CONFIG.moon.radius, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const free = (difficulty = 'easy') => ({ body: space, difficulty, contacts: false });
const make = (over = {}) => Object.assign(createRocketState({ position: [0, 0, 1e7], velocity: [0, 0, 0], orientation: [1, 0, 0, 0], fuel: 700 }), over);
const runFor = (s, cmd, env, seconds) => { for (let i = 0; i < Math.round(seconds / dt); i++) step(s, cmd, env, dt); };

test('free fall near the surface accelerates at local g', () => {
  const r0 = CONFIG.moon.radius + 1000;
  const s = make({ r: [r0, 0, 0] });
  runFor(s, {}, { body: moon, difficulty: 'easy', contacts: false }, 1);
  close(-s.v[0], CONFIG.moon.gm / r0 ** 2, 0.01);
});

test('circular orbit keeps its radius over one period', () => {
  const r0 = CONFIG.moon.radius + 20000;
  const v0 = Math.sqrt(CONFIG.moon.gm / r0);
  const s = make({ r: [r0, 0, 0], v: [0, v0, 0] });
  const period = (2 * Math.PI * r0) / v0;
  runFor(s, {}, { body: moon, difficulty: 'easy', contacts: false }, period);
  close(length(s.r), r0, r0 * 0.001);
});

test('main engine obeys the rocket equation', () => {
  const s = make();
  const m0 = totalMass(s);
  runFor(s, { throttle: 1 }, free(), 30);
  const dv = length(s.v);
  close(dv, CONFIG.rocket.ispMain * CONFIG.g0 * Math.log(m0 / totalMass(s)), dv * 0.005);
});

test('roll stays zero', () => {
  const s = make({ w: [0, 0, 1] });
  step(s, {}, free(), dt);
  assert.equal(s.w[2], 0);
});

test('rotation keys spin without drifting (easy)', () => {
  const s = make();
  runFor(s, { rot: [0, 1] }, free(), 1);
  assert.ok(s.w[1] > 0.1);
  assert.ok(length(s.v) < 1e-6);
});

test('translation keys slide without spinning (easy) but spin a little (hard)', () => {
  const easy = make();
  runFor(easy, { trans: [1, 0] }, free('easy'), 1);
  assert.ok(easy.v[0] > 0.2);
  assert.ok(Math.abs(easy.w[1]) < 1e-9);
  const hard = make();
  runFor(hard, { trans: [1, 0] }, free('hard'), 1);
  assert.ok(Math.abs(hard.w[1]) > 1e-4);
});

test('SAS brings rotation below its threshold', () => {
  const s = make({ w: [0.2, -0.1, 0] });
  runFor(s, { sas: true }, free(), 10);
  assert.ok(Math.hypot(s.w[0], s.w[1]) < CONFIG.sas.rateThreshold * 2);
  assert.ok(s.rcs < 60);
});

test('sasCommand opposes the spin and idles below threshold', () => {
  assert.deepEqual(sasCommand([0.1, -0.1, 0]), [-1, 1]);
  assert.deepEqual(sasCommand([0.001, 0, 0]), [0, 0]);
});

test('propellant running out mid-step never goes negative and stops thrust', () => {
  const s = make({ fuel: 0.001, engineOn: true, throttle: 1 });
  step(s, { throttle: 1 }, free(), dt);
  assert.equal(s.fuel, 0);
  const v = s.v.slice();
  runFor(s, { throttle: 1 }, free(), 1);
  close(length(sub(s.v, v)), 0, 1e-9);
  const r = make({ rcs: 0.0001, thrusters: [1, 0, 0, 0, 0, 0, 0, 0] });
  runFor(r, { trans: [1, 0] }, free(), 1);
  assert.equal(r.rcs, 0);
  assert.ok(r.thrusters.every((o) => o === 0));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/sim/physics.js'`.

- [ ] **Step 3: Implement `src/sim/sas.js`**

```js
import { CONFIG } from '../config.js';

// Rate damping only: fires the pairs that oppose the current pitch/yaw rate.
export function sasCommand(w, sasCfg = CONFIG.sas) {
  const thr = sasCfg.rateThreshold;
  if (Math.hypot(w[0], w[1]) <= thr) return [0, 0];
  return [
    Math.abs(w[0]) > thr * 0.5 ? -Math.sign(w[0]) : 0,
    Math.abs(w[1]) > thr * 0.5 ? -Math.sign(w[1]) : 0,
  ];
}
```

- [ ] **Step 4: Implement `src/sim/physics.js`**

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (the orbit test runs ~330 000 steps; it should finish in a few seconds).

- [ ] **Step 6: Commit**

```bash
git add src/sim/sas.js src/sim/physics.js tests/physics.test.js
git commit -m "feat: fixed-step physics with gravity, engine, thrusters and SAS"
```

---

### Task 7: Leg contact, hull probes and landing judgement

**Files:**
- Create: `src/sim/contact.js`
- Modify: `src/sim/physics.js` (wire contacts into the force sum)
- Test: `tests/contact.test.js`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: `EMPTY_CONTACT`; `computeContacts(s, zcm, body, cfg?) → { force (world), torque (body), feet: [{ pos, groundPoint, depth, contact }], anyFoot, hullHit }` (returns `EMPTY_CONTACT` when AGL > `legs.contactCheckAgl`); `tiltDeg(s)`; `touchdownMetrics(s, contact, body) → { vs, hs, tilt, rate, slope }` (m/s, m/s, °, °/s, °); `gradeTouchdown(metrics, landingCfg?) → { grade: 'perfect'|'safe'|'crash', checks: [{ key, value, grade }] }`; `worstGrade(a, b)`; `class LandingJudge { status: 'flying'|'touchdown'|'landed'|'crashed', grade, checks, reason, settle, cfg, update({ contact, engineOff, tiltDeg, metricsFn, dt }) → status, reset() }`. Crash `reason` is a check key (`'vs'|'hs'|'tilt'|'rate'|'slope'`), `'hull'` or `'tipped'`. After this task `step()` returns a real `contact`.

- [ ] **Step 1: Write the failing test `tests/contact.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/physics.js';
import { computeContacts, touchdownMetrics, gradeTouchdown, LandingJudge, tiltDeg } from '../src/sim/contact.js';
import { createRocketState } from '../src/sim/rocket.js';
import { createBody } from '../src/sim/body.js';
import { latLonToDir, tangentBasis } from '../src/sim/frame.js';
import { fromBasis, fromAxisAngle, multiply } from '../src/math/quat.js';
import { scale } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const dt = 1 / 120;
const R = CONFIG.moon.radius;
const flat = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const site = latLonToDir(10, 20);
const { east, north } = tangentBasis(site);

function upright({ feetAbove, vDown, tilt = 0 }) {
  let q = fromBasis(east, north, site);
  if (tilt) q = multiply(fromAxisAngle(east, (tilt * Math.PI) / 180), q);
  return createRocketState({ position: scale(site, R + 3.4 + feetAbove), velocity: scale(site, -vDown), orientation: q, fuel: 300 });
}

function simulateLanding(s, { maxTime = 12, throttle = 0 } = {}) {
  const judge = new LandingJudge();
  const env = { body: flat, difficulty: 'easy' };
  for (let t = 0; t < maxTime; t += dt) {
    const info = step(s, { throttle }, env, dt);
    const status = judge.update({
      contact: info.contact,
      engineOff: !s.engineOn && s.ignition === 0,
      tiltDeg: tiltDeg(s),
      metricsFn: () => touchdownMetrics(s, info.contact, flat),
      dt,
    });
    if (status === 'landed' || status === 'crashed') break;
  }
  return judge;
}

const contactOf = (anyFoot, hullHit = false) => ({ anyFoot, hullHit });
const good = () => ({ vs: 0.5, hs: 0.1, tilt: 1, rate: 0.5, slope: 1 });

test('soft touchdown at about 2 m/s lands with a safe grade', () => {
  const j = simulateLanding(upright({ feetAbove: 0.5, vDown: 1.5 }));
  assert.equal(j.status, 'landed');
  assert.equal(j.grade, 'safe');
});

test('very gentle touchdown is perfect', () => {
  const j = simulateLanding(upright({ feetAbove: 0.05, vDown: 0.3 }));
  assert.equal(j.status, 'landed');
  assert.equal(j.grade, 'perfect');
});

test('hard touchdown crashes on vertical speed', () => {
  const j = simulateLanding(upright({ feetAbove: 0.1, vDown: 4 }));
  assert.equal(j.status, 'crashed');
  assert.equal(j.reason, 'vs');
});

test('tilted touchdown crashes on tilt', () => {
  const j = simulateLanding(upright({ feetAbove: 1, vDown: 0.5, tilt: 20 }));
  assert.equal(j.status, 'crashed');
  assert.equal(j.reason, 'tilt');
});

test('hull below ground is a hull hit', () => {
  // body X = north, body Y = up, body Z = east: lying on its side, centre 1 m above ground
  const lying = createRocketState({ position: scale(site, R + 1.0), velocity: [0, 0, 0], orientation: fromBasis(north, site, east), fuel: 300 });
  assert.equal(computeContacts(lying, 0, flat).hullHit, true);
});

test('far above ground there is no contact work', () => {
  const c = computeContacts(upright({ feetAbove: 100, vDown: 0 }), 0, flat);
  assert.equal(c.anyFoot, false);
  assert.equal(c.feet.length, 0);
});

test('grade boundaries: values equal to a threshold fall into the worse grade', () => {
  assert.equal(gradeTouchdown({ ...good(), vs: 1.0 }).grade, 'safe');
  assert.equal(gradeTouchdown({ ...good(), vs: 2.5 }).grade, 'crash');
  assert.equal(gradeTouchdown({ ...good(), slope: 9.99 }).grade, 'safe');
  assert.equal(gradeTouchdown(good()).grade, 'perfect');
});

test('engine still running keeps the rocket in touchdown; cutting it lands after 3 s', () => {
  const j = new LandingJudge();
  for (let t = 0; t < 5; t += dt) j.update({ contact: contactOf(true), engineOff: false, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.status, 'touchdown');
  for (let t = 0; t < 3.1; t += dt) j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.status, 'landed');
});

test('a hop longer than 1 s resets the touchdown', () => {
  const j = new LandingJudge();
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  for (let t = 0; t < 1.2; t += dt) j.update({ contact: contactOf(false), engineOff: false, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.status, 'flying');
  assert.equal(j.grade, null);
});

test('bounce keeps the worse grade', () => {
  const j = new LandingJudge();
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: () => ({ ...good(), vs: 2 }), dt });
  j.update({ contact: contactOf(false), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.grade, 'safe');
});

test('tipping past 10 degrees during settle is a crash', () => {
  const j = new LandingJudge();
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 12, metricsFn: good, dt });
  assert.equal(j.status, 'crashed');
  assert.equal(j.reason, 'tipped');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/sim/contact.js'`.

- [ ] **Step 3: Implement `src/sim/contact.js`**

```js
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

export function touchdownMetrics(s, contact, body) {
  const up = normalize(s.r);
  const g = contact.feet.map((f) => f.groundPoint);
  let n = g.length === 4 ? normalize(cross(sub(g[0], g[1]), sub(g[2], g[3]))) : up;
  if (dot(n, up) < 0) n = scale(n, -1);
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
    if (contact.hullHit) return this.crash('hull');
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
```

- [ ] **Step 4: Wire contacts into `src/sim/physics.js`**

Add the import after the `sas.js` import:
```js
import { computeContacts } from './contact.js';
```
Replace the line `  const contact = null;` with:
```js
  const contact = env.contacts === false ? null : computeContacts(s, zcm, env.body, cfg);
  if (contact) {
    force = add(force, contact.force);
    torque = add(torque, contact.torque);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (earlier suites still pass because they use `contacts: false`).

- [ ] **Step 6: Commit**

```bash
git add src/sim/contact.js src/sim/physics.js tests/contact.test.js
git commit -m "feat: spring-damper legs, hull probes and landing judge"
```

---

### Task 8: Prediction aids

**Files:**
- Create: `src/sim/predict.js`
- Test: `tests/predict.test.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `predictImpact(s, body, cfg?) → { point: [x,y,z] world, time } | null` (gravity + current thrust held along the current axis, 0.1 s steps, ≤ 120 s); `burnNowHeight(s, body, cfg?) → metres` (altitude lost if full throttle is commanded now, including ignition delay and lag; 0 when not descending; `Infinity` if it cannot stop); `velocityMarkers(s) → { prograde, retrograde } | null`.

- [ ] **Step 1: Write the failing test `tests/predict.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictImpact, burnNowHeight, velocityMarkers } from '../src/sim/predict.js';
import { createRocketState } from '../src/sim/rocket.js';
import { createBody } from '../src/sim/body.js';
import { latLonToDir, tangentBasis, surfaceOffset } from '../src/sim/frame.js';
import { fromBasis } from '../src/math/quat.js';
import { scale, add, normalize } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const R = CONFIG.moon.radius;
const flat = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const site = latLonToDir(10, 20);
const { east, north } = tangentBasis(site);
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const make = (alt, vel, over = {}) => Object.assign(
  createRocketState({ position: scale(site, R + alt), velocity: vel, orientation: fromBasis(east, north, site), fuel: 700 }),
  over,
);

test('ballistic impact time and point', () => {
  const p = predictImpact(make(100, scale(east, 10)), flat);
  close(p.time, Math.sqrt((2 * 100) / 1.62), 0.2);
  close(surfaceOffset(site, normalize(p.point), R).east, 111, 3);
});

test('burn-now height with the engine already at full throttle', () => {
  const s = make(500, scale(site, -10), { engineOn: true, throttle: 1 });
  const a = 12000 / 2760 - 1.62;
  close(burnNowHeight(s, flat), 100 / (2 * a), 1);
});

test('burn-now height grows when the engine must ignite first', () => {
  const on = burnNowHeight(make(500, scale(site, -10), { engineOn: true, throttle: 1 }), flat);
  const off = burnNowHeight(make(500, scale(site, -10)), flat);
  assert.ok(off > on + 5);
});

test('burn-now height is zero while climbing', () => {
  assert.equal(burnNowHeight(make(500, scale(site, 3)), flat), 0);
});

test('velocity markers', () => {
  assert.equal(velocityMarkers(make(10, [0, 0, 0])), null);
  const m = velocityMarkers(make(10, add(scale(site, -3), scale(east, 4))));
  close(m.prograde[0] + m.retrograde[0], 0, 1e-12);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/sim/predict.js'`.

- [ ] **Step 3: Implement `src/sim/predict.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/predict.js tests/predict.test.js
git commit -m "feat: impact point, burn-now height and velocity markers"
```

---

### Task 9: Fixed-step game loop

**Files:**
- Create: `src/game/loop.js`
- Test: `tests/loop.test.js`

**Interfaces:**
- Produces: `class FixedStepLoop({ dt, maxSteps, step })` with `paused` (boolean), `acc`, `dt`, `alpha` getter (0 ≤ alpha < 1), `advance(elapsedSeconds) → { steps, alpha }`. Non-finite or negative elapsed counts as 0; after `maxSteps` the remainder is dropped.

- [ ] **Step 1: Write the failing test `tests/loop.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../src/game/loop.js';

const make = () => {
  const calls = [];
  const loop = new FixedStepLoop({ dt: 1 / 120, maxSteps: 8, step: (dt) => calls.push(dt) });
  return { loop, calls };
};

test('a 60 Hz frame runs two physics steps', () => {
  const { loop, calls } = make();
  assert.equal(loop.advance(1 / 60 + 1e-9).steps, 2);
  assert.equal(calls.length, 2);
});

test('a 5 s gap (hidden tab) runs at most 8 steps and drops the rest', () => {
  const { loop } = make();
  assert.equal(loop.advance(5).steps, 8);
  assert.ok(loop.acc < loop.dt);
  assert.equal(loop.advance(0).steps, 0);
});

test('paused loops do nothing', () => {
  const { loop, calls } = make();
  loop.paused = true;
  loop.advance(1);
  assert.equal(calls.length, 0);
});

test('alpha stays in [0, 1) and bad input counts as zero', () => {
  const { loop } = make();
  const r = loop.advance(0.004);
  assert.equal(r.steps, 0);
  assert.ok(r.alpha > 0.4 && r.alpha < 0.6);
  assert.equal(loop.advance(NaN).steps, 0);
  assert.equal(loop.advance(-3).steps, 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/game/loop.js'`.

- [ ] **Step 3: Implement `src/game/loop.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/loop.js tests/loop.test.js
git commit -m "feat: fixed-step loop with spiral guard"
```

---

### Task 10: Missions, world setup and scoring

**Files:**
- Create: `src/game/missions.js`
- Test: `tests/missions.test.js`

**Interfaces:**
- Consumes: terrain, body, frame, rocket, quat.
- Produces: `MISSIONS` (array of `{ id, name, tagline, seed, site: { lat, lon }, sun: { elevation, azimuth }, start: { agl, east, north, vEast, vNorth, vUp }, fuel, rcs, sasOn, targetPad: { radius }, goal: { type: 'any' } | { type: 'pinpoint', medals: { gold, silver, bronze } }, unlockedBy }`); `getMission(id)`; `buildWorld(mission, cfg?) → { body, terrain, siteDir, sitePoint, pads, padHints: [{ point, up, radius }], sunDir }`; `makeStartState(mission, world) → rocket state`; `landingDistance(world, r) → metres`; `medalFor(mission, distance) → 'gold'|'silver'|'bronze'|null`; `GRADE_POINTS`; `computeScore({ mission, outcome, grade, fuel, distance, time, difficulty }) → { total, parts: { grade, fuel, distance, time }, multiplier }`; `unlocksAfter(missionId, outcome) → number[]`; `isUnlocked(mission, unlockedIds) → boolean`.

- [ ] **Step 1: Write the failing test `tests/missions.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, getMission, buildWorld, makeStartState, landingDistance, medalFor, computeScore, unlocksAfter, isUnlocked } from '../src/game/missions.js';
import { tiltDeg } from '../src/sim/contact.js';
import { normalize, dot, length, sub, scale } from '../src/math/vec3.js';

const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('mission 1 starts 1500 m up, falling 20 m/s, drifting 30 m/s, upright, 1200 m from the site', () => {
  const m = getMission(1);
  const world = buildWorld(m);
  const s = makeStartState(m, world);
  const up = normalize(s.r);
  close(world.body.agl(s.r), 1500, 1e-6);
  close(dot(s.v, up), -20, 1e-9);
  close(length(sub(s.v, scale(up, dot(s.v, up)))), 30, 1e-9);
  close(tiltDeg(s), 0, 1e-6);
  close(landingDistance(world, s.r), 1200, 0.5);
  assert.equal(s.fuel, 500);
});

test('mission 2 starts 3000 m up and 2 km out with 700 kg', () => {
  const m = getMission(2);
  const world = buildWorld(m);
  const s = makeStartState(m, world);
  close(world.body.agl(s.r), 3000, 1e-6);
  close(landingDistance(world, s.r), 2000, 0.5);
  assert.equal(s.fuel, 700);
});

test('the target pad is flat', () => {
  const world = buildWorld(getMission(2));
  assert.ok(world.body.slopeDeg(world.siteDir) < 0.05);
});

test('mission 1 provides pad hints; mission 2 does not', () => {
  assert.ok(buildWorld(getMission(1)).padHints.length > 0);
  assert.equal(buildWorld(getMission(2)).padHints.length, 0);
});

test('medals for pinpoint only', () => {
  const m2 = getMission(2);
  assert.equal(medalFor(m2, 4.9), 'gold');
  assert.equal(medalFor(m2, 5), 'gold');
  assert.equal(medalFor(m2, 19), 'silver');
  assert.equal(medalFor(m2, 49), 'bronze');
  assert.equal(medalFor(m2, 51), null);
  assert.equal(medalFor(getMission(1), 1), null);
});

test('score parts, hard multiplier and crash zero', () => {
  const base = { mission: getMission(2), outcome: 'landed', grade: 'safe', fuel: 123.4, distance: 12.3, time: 95.2 };
  const easy = computeScore({ ...base, difficulty: 'easy' });
  assert.deepEqual(easy.parts, { grade: 600, fuel: 123, distance: 377, time: 205 });
  assert.equal(easy.total, 1305);
  assert.equal(computeScore({ ...base, difficulty: 'hard' }).total, 1958);
  assert.equal(computeScore({ ...base, outcome: 'crashed', difficulty: 'easy' }).total, 0);
  assert.equal(computeScore({ ...base, mission: getMission(1), difficulty: 'easy' }).parts.distance, 0);
});

test('unlocking', () => {
  assert.deepEqual(unlocksAfter(1, 'landed'), [2]);
  assert.deepEqual(unlocksAfter(1, 'crashed'), []);
  assert.equal(isUnlocked(getMission(1), []), true);
  assert.equal(isUnlocked(getMission(2), [1]), false);
  assert.equal(isUnlocked(getMission(2), [1, 2]), true);
  assert.equal(MISSIONS.length, 2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/game/missions.js'`.

- [ ] **Step 3: Implement `src/game/missions.js`**

```js
import { CONFIG } from '../config.js';
import { createTerrain } from '../sim/terrain.js';
import { createBody } from '../sim/body.js';
import { latLonToDir, tangentBasis, offsetDirection, surfaceOffset } from '../sim/frame.js';
import { createRocketState } from '../sim/rocket.js';
import { fromBasis } from '../math/quat.js';
import { add, scale, normalize, DEG } from '../math/vec3.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'First Touchdown',
    tagline: 'Learn the lander and set it down anywhere flat.',
    seed: 1969,
    site: { lat: 8, lon: 23 },
    sun: { elevation: 22, azimuth: 115 },
    start: { agl: 1500, east: -1200, north: 0, vEast: 30, vNorth: 0, vUp: -20 },
    fuel: 500,
    rcs: 60,
    sasOn: true,
    targetPad: { radius: 60 },
    goal: { type: 'any' },
    unlockedBy: null,
  },
  {
    id: 2,
    name: 'Pinpoint',
    tagline: 'Kill your drift and land on the marked pad.',
    seed: 4242,
    site: { lat: -12, lon: 41 },
    sun: { elevation: 18, azimuth: 250 },
    start: { agl: 3000, east: -2000, north: 0, vEast: 60, vNorth: 0, vUp: 0 },
    fuel: 700,
    rcs: 60,
    sasOn: false,
    targetPad: { radius: 70 },
    goal: { type: 'pinpoint', medals: { gold: 5, silver: 20, bronze: 50 } },
    unlockedBy: 1,
  },
];

export const getMission = (id) => MISSIONS.find((m) => m.id === id) ?? null;

export function buildWorld(mission, cfg = CONFIG) {
  const radius = cfg.moon.radius;
  const siteDir = latLonToDir(mission.site.lat, mission.site.lon);
  const pads = [{ dir: siteDir, radius: mission.targetPad.radius }];
  const terrain = createTerrain({ seed: mission.seed, radius, pads });
  const body = createBody({ radius, gm: cfg.moon.gm, terrain });
  const { east, north } = tangentBasis(siteDir);
  const el = mission.sun.elevation * DEG, az = mission.sun.azimuth * DEG;
  const horizontal = add(scale(east, Math.sin(az)), scale(north, Math.cos(az)));
  const sunDir = normalize(add(scale(siteDir, Math.sin(el)), scale(horizontal, Math.cos(el))));
  const padHints = mission.goal.type === 'any'
    ? terrain.padsNear(siteDir, 4000).map((p) => ({ point: scale(p.dir, radius + p.height), up: p.dir, radius: p.radius }))
    : [];
  return { body, terrain, siteDir, sitePoint: body.surfacePoint(siteDir), pads, padHints, sunDir };
}

export function makeStartState(mission, world) {
  const { start } = mission;
  const { body, siteDir } = world;
  const dir = offsetDirection(siteDir, start.east, start.north, body.radius);
  const { east, north } = tangentBasis(dir);
  const position = scale(dir, body.surfaceRadius(dir) + start.agl);
  const velocity = add(add(scale(east, start.vEast), scale(north, start.vNorth)), scale(dir, start.vUp));
  return createRocketState({ position, velocity, orientation: fromBasis(east, north, dir), fuel: mission.fuel, rcs: mission.rcs });
}

export const landingDistance = (world, r) => surfaceOffset(world.siteDir, normalize(r), world.body.radius).distance;

export function medalFor(mission, distance) {
  if (mission.goal.type !== 'pinpoint') return null;
  const { gold, silver, bronze } = mission.goal.medals;
  if (distance <= gold) return 'gold';
  if (distance <= silver) return 'silver';
  if (distance <= bronze) return 'bronze';
  return null;
}

export const GRADE_POINTS = { perfect: 1000, safe: 600 };

export function computeScore({ mission, outcome, grade, fuel, distance, time, difficulty }) {
  if (outcome !== 'landed') return { total: 0, parts: { grade: 0, fuel: 0, distance: 0, time: 0 }, multiplier: 1 };
  const parts = {
    grade: GRADE_POINTS[grade] ?? 0,
    fuel: Math.round(fuel),
    distance: mission.goal.type === 'pinpoint' ? Math.max(0, Math.round(500 - 10 * distance)) : 0,
    time: Math.max(0, Math.round(300 - time)),
  };
  const multiplier = difficulty === 'hard' ? 1.5 : 1;
  return { total: Math.round((parts.grade + parts.fuel + parts.distance + parts.time) * multiplier), parts, multiplier };
}

export const unlocksAfter = (missionId, outcome) =>
  outcome === 'landed' ? MISSIONS.filter((m) => m.unlockedBy === missionId).map((m) => m.id) : [];

export const isUnlocked = (mission, unlocked) => mission.unlockedBy === null || unlocked.includes(mission.id);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. If "mission 1 provides pad hints" fails because seed 1969 has no procedural pad within 4 km, change mission 1's `seed` to the next integer that passes (1970, 1971, …) and note it in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/game/missions.js tests/missions.test.js
git commit -m "feat: mission definitions, start states, medals and scoring"
```

---

### Task 11: Persistence

**Files:**
- Create: `src/game/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Produces: `STORAGE_KEY = 'munlendr.v1'`, `HISTORY_LIMIT = 10`, `defaultData()`, `createStorage(backend?) → { load() → data, save(data) → boolean }` (backend = `{ getItem, setItem }`; defaults to `localStorage` when reachable), `recordAttempt(data, attempt, unlockIds) → newData` (pure), `isNewBest(data, attempt) → boolean`. Data shape is spec §10. `attempt = { mission, difficulty, outcome, grade, score, medal, fuel, distance, time, date }`.

- [ ] **Step 1: Write the failing test `tests/storage.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, defaultData, recordAttempt, isNewBest, STORAGE_KEY } from '../src/game/storage.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
const attempt = (over = {}) => ({ mission: 1, difficulty: 'easy', outcome: 'landed', grade: 'safe', score: 1000, medal: null, fuel: 100, distance: 30, time: 80, date: '2026-10-04T12:00:00Z', ...over });

test('round trip', () => {
  const st = createStorage(memory());
  const d = recordAttempt(defaultData(), attempt(), [2]);
  assert.equal(st.save(d), true);
  assert.deepEqual(st.load(), d);
});

test('missing, corrupt or wrong-version data falls back to defaults', () => {
  const b = memory();
  const st = createStorage(b);
  assert.deepEqual(st.load(), defaultData());
  b.map.set(STORAGE_KEY, '{not json');
  assert.deepEqual(st.load(), defaultData());
  b.map.set(STORAGE_KEY, JSON.stringify({ version: 99 }));
  assert.deepEqual(st.load(), defaultData());
});

test('older saves gain new settings keys', () => {
  const b = memory();
  const d = defaultData();
  delete d.settings.hudScale;
  b.map.set(STORAGE_KEY, JSON.stringify(d));
  assert.equal(createStorage(b).load().settings.hudScale, 1);
});

test('unavailable or throwing storage never throws', () => {
  assert.deepEqual(createStorage(null).load(), defaultData());
  assert.equal(createStorage(null).save(defaultData()), false);
  const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(createStorage(bad).load(), defaultData());
  assert.equal(createStorage(bad).save(defaultData()), false);
});

test('history keeps the last 10, newest first', () => {
  let d = defaultData();
  for (let i = 0; i < 12; i++) d = recordAttempt(d, attempt({ score: i }), []);
  assert.equal(d.history.length, 10);
  assert.equal(d.history[0].score, 11);
});

test('best only improves, per difficulty; medals keep the best ever', () => {
  let d = recordAttempt(defaultData(), attempt({ mission: 2, score: 900, medal: 'silver' }), []);
  d = recordAttempt(d, attempt({ mission: 2, score: 800, medal: 'gold' }), []);
  assert.equal(d.best['2'].easy.score, 900);
  assert.equal(d.best['2'].easy.medal, 'gold');
  d = recordAttempt(d, attempt({ mission: 2, difficulty: 'hard', score: 10 }), []);
  assert.equal(d.best['2'].hard.score, 10);
  d = recordAttempt(d, attempt({ mission: 2, outcome: 'crashed', score: 0 }), []);
  assert.equal(d.best['2'].easy.score, 900);
});

test('unlocks are a sorted set and isNewBest compares against the stored best', () => {
  let d = recordAttempt(defaultData(), attempt(), [2]);
  d = recordAttempt(d, attempt(), [2]);
  assert.deepEqual(d.unlocked, [1, 2]);
  assert.equal(isNewBest(d, attempt({ score: 999 })), false);
  assert.equal(isNewBest(d, attempt({ score: 1001 })), true);
  assert.equal(isNewBest(d, attempt({ outcome: 'crashed' })), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/game/storage.js'`.

- [ ] **Step 3: Implement `src/game/storage.js`**

```js
export const STORAGE_KEY = 'munlendr.v1';
export const HISTORY_LIMIT = 10;

export function defaultData() {
  return {
    version: 1,
    unlocked: [1],
    best: {},
    history: [],
    settings: { controlFrame: 'camera', invertDrag: false, hudScale: 1 },
  };
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isValid(d) {
  return !!d && typeof d === 'object' && d.version === 1 && Array.isArray(d.unlocked)
    && !!d.best && typeof d.best === 'object' && Array.isArray(d.history);
}

export function createStorage(backend = safeLocalStorage()) {
  return {
    load() {
      try {
        const raw = backend?.getItem(STORAGE_KEY);
        if (!raw) return defaultData();
        const d = JSON.parse(raw);
        if (!isValid(d)) return defaultData();
        const def = defaultData();
        return { ...def, ...d, settings: { ...def.settings, ...(d.settings ?? {}) } };
      } catch {
        return defaultData();
      }
    },
    save(data) {
      try {
        if (!backend) return false;
        backend.setItem(STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    },
  };
}

const MEDAL_RANK = { gold: 3, silver: 2, bronze: 1 };
const bestMedal = (a, b) => [a, b].filter(Boolean).sort((x, y) => MEDAL_RANK[y] - MEDAL_RANK[x])[0] ?? null;

export function recordAttempt(data, attempt, unlockIds = []) {
  const next = structuredClone(data);
  next.history = [attempt, ...next.history].slice(0, HISTORY_LIMIT);
  next.unlocked = [...new Set([...next.unlocked, ...unlockIds])].sort((a, b) => a - b);
  if (attempt.outcome === 'landed') {
    const key = String(attempt.mission);
    next.best[key] ??= { easy: null, hard: null };
    const prev = next.best[key][attempt.difficulty];
    const medal = bestMedal(prev?.medal, attempt.medal);
    next.best[key][attempt.difficulty] = !prev || attempt.score > prev.score
      ? { score: attempt.score, grade: attempt.grade, fuel: attempt.fuel, distance: attempt.distance, time: attempt.time, date: attempt.date, medal }
      : { ...prev, medal };
  }
  return next;
}

export function isNewBest(data, attempt) {
  if (attempt.outcome !== 'landed') return false;
  const prev = data.best?.[String(attempt.mission)]?.[attempt.difficulty];
  return !prev || attempt.score > prev.score;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/storage.js tests/storage.test.js
git commit -m "feat: versioned localStorage persistence with safe fallback"
```

---

### Task 12: Input — keyboard, gamepad and control-frame mapping

**Files:**
- Create: `src/game/input.js`
- Test: `tests/input.test.js`

**Interfaces:**
- Consumes: `CONFIG`, vec3, quat.
- Produces: `GAME_CODES` (Set of `KeyboardEvent.code`s the game owns); `class Input(target, { getGamepads?, throttleRate? })` with `attach()`, `detach()`, `setEnabled(bool)`, `reset(throttle = 0)`, `throttle` (commanded 0..1), `update(dt) → { throttle, intent: { pitch, yaw, fwd, right } (each −1..1), actions: string[], look: [x, y] }`. Actions: `'sas' | 'camera' | 'aids' | 'vehicleView' | 'hud' | 'pause' | 'blur'` (`fullThrottle` and `cut` are applied to `throttle` internally). `mapControls(intent, frame, q) → { rot: [x, y], trans: [x, y] }` where `frame = { forward, right, up }` are world unit vectors; `bodyControlFrame(q) → frame`.
- Keys (by `code`, so Shift and keyboard layouts do not change them): throttle up Shift/R, down Ctrl/F, Z full, X cut, W/S pitch, A/D yaw, I/K/J/L translate, T SAS, C camera, G aids, V vehicle view, H HUD, Escape pause.

- [ ] **Step 1: Write the failing test `tests/input.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input, mapControls, bodyControlFrame } from '../src/game/input.js';
import { fromBasis } from '../src/math/quat.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
function key(type, code, extra = {}) {
  return Object.assign(new Event(type, { cancelable: true }), { code, ctrlKey: false, repeat: false, ...extra });
}
function setup(pads = []) {
  const target = new EventTarget();
  const input = new Input(target, { getGamepads: () => pads });
  input.attach();
  input.setEnabled(true);
  return { target, input };
}

test('Shift held for 1 s raises the throttle command by 50%', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'ShiftLeft'));
  input.update(0.5);
  input.update(0.5);
  close(input.throttle, 0.5);
});

test('Z sets full throttle, X cuts', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'KeyZ'));
  assert.equal(input.update(0.01).throttle, 1);
  target.dispatchEvent(key('keydown', 'KeyX'));
  assert.equal(input.update(0.01).throttle, 0);
});

test('W/D/J map to intent axes', () => {
  const { target, input } = setup();
  ['KeyW', 'KeyD', 'KeyJ'].forEach((c) => target.dispatchEvent(key('keydown', c)));
  assert.deepEqual(input.update(0.01).intent, { pitch: 1, yaw: 1, fwd: 0, right: -1 });
});

test('Ctrl combos and game keys are prevented during flight (Ctrl+W would close the tab)', () => {
  const { target } = setup();
  const e = key('keydown', 'KeyW', { ctrlKey: true });
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, true);
  const s = key('keydown', 'KeyS');
  target.dispatchEvent(s);
  assert.equal(s.defaultPrevented, true);
});

test('nothing is prevented outside flight', () => {
  const { target, input } = setup();
  input.setEnabled(false);
  const e = key('keydown', 'KeyW');
  target.dispatchEvent(e);
  assert.equal(e.defaultPrevented, false);
});

test('window blur releases held keys and reports blur', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'KeyW'));
  target.dispatchEvent(new Event('blur'));
  const out = input.update(0.01);
  assert.equal(out.intent.pitch, 0);
  assert.ok(out.actions.includes('blur'));
});

test('auto-repeat does not re-trigger toggles', () => {
  const { target, input } = setup();
  target.dispatchEvent(key('keydown', 'KeyT'));
  target.dispatchEvent(key('keydown', 'KeyT', { repeat: true }));
  assert.deepEqual(input.update(0.01).actions, ['sas']);
});

test('gamepad triggers, sticks and edge-triggered buttons', () => {
  const pad = { buttons: Array.from({ length: 16 }, () => ({ value: 0 })), axes: [0, -1, 0.5, 0] };
  pad.buttons[7].value = 1;
  pad.buttons[3].value = 1;
  const { input } = setup([pad]);
  const a = input.update(1);
  close(a.throttle, 0.5);
  assert.equal(a.intent.pitch, 1);
  assert.deepEqual(a.look, [0.5, 0]);
  assert.deepEqual(a.actions, ['sas']);
  assert.deepEqual(input.update(0.01).actions, []);
});

test('body frame: W tilts the nose toward body +X (torque about +Y); L slides toward -Y', () => {
  const q = [1, 0, 0, 0];
  const m = mapControls({ pitch: 1, yaw: 0, fwd: 0, right: 0 }, bodyControlFrame(q), q);
  close(m.rot[0], 0); close(m.rot[1], 1);
  const t = mapControls({ pitch: 0, yaw: 0, fwd: 0, right: 1 }, bodyControlFrame(q), q);
  close(t.trans[0], 0); close(t.trans[1], -1);
});

test('camera frame: W tilts toward the camera forward direction whatever the body heading', () => {
  // world: x = east, y = north, z = up; the rocket's body X points north
  const q = fromBasis([0, 1, 0], [-1, 0, 0], [0, 0, 1]);
  const frame = { forward: [1, 0, 0], right: [0, -1, 0], up: [0, 0, 1] }; // camera looks east
  const m = mapControls({ pitch: 1, yaw: 0, fwd: 0, right: 0 }, frame, q);
  close(m.rot[0], 1); close(m.rot[1], 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/game/input.js'`.

- [ ] **Step 3: Implement `src/game/input.js`**

```js
import { CONFIG } from '../config.js';
import { add, scale, cross } from '../math/vec3.js';
import { rotate, conjugate } from '../math/quat.js';

const ACTION_KEYS = {
  KeyZ: 'fullThrottle', KeyX: 'cut', KeyT: 'sas', KeyC: 'camera',
  KeyG: 'aids', KeyV: 'vehicleView', KeyH: 'hud', Escape: 'pause',
};
const HOLD = {
  throttleUp: ['ShiftLeft', 'ShiftRight', 'KeyR'],
  throttleDown: ['ControlLeft', 'ControlRight', 'KeyF'],
  pitchFwd: ['KeyW'], pitchBack: ['KeyS'], yawLeft: ['KeyA'], yawRight: ['KeyD'],
  fwd: ['KeyI'], back: ['KeyK'], left: ['KeyJ'], right: ['KeyL'],
};
export const GAME_CODES = new Set([...Object.keys(ACTION_KEYS), ...Object.values(HOLD).flat()]);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const deadzone = (v) => (Math.abs(v) < 0.2 ? 0 : v);

export class Input {
  constructor(target, { getGamepads, throttleRate = CONFIG.input.throttleRate } = {}) {
    this.target = target;
    this.getGamepads = getGamepads ?? (() => globalThis.navigator?.getGamepads?.() ?? []);
    this.throttleRate = throttleRate;
    this.held = new Set();
    this.queue = [];
    this.throttle = 0;
    this.enabled = false;
    this.padPrev = {};
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
  }

  attach() {
    this.target.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('keyup', this.onKeyUp);
    this.target.addEventListener('blur', this.onBlur);
  }

  detach() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.held.clear();
  }

  reset(throttle = 0) {
    this.held.clear();
    this.queue.length = 0;
    this.throttle = throttle;
  }

  onKeyDown(e) {
    if (!this.enabled) return;
    if (GAME_CODES.has(e.code) || e.ctrlKey) e.preventDefault();
    this.held.add(e.code);
    if (e.repeat) return;
    const action = ACTION_KEYS[e.code];
    if (action) this.queue.push(action);
  }

  onKeyUp(e) {
    this.held.delete(e.code);
  }

  onBlur() {
    this.held.clear();
    this.queue.push('blur');
  }

  isHeld(name) {
    return HOLD[name].some((c) => this.held.has(c));
  }

  axis(pos, neg) {
    return (this.isHeld(pos) ? 1 : 0) - (this.isHeld(neg) ? 1 : 0);
  }

  readPad(actions) {
    const none = { throttle: 0, pitch: 0, yaw: 0, fwd: 0, right: 0, look: [0, 0] };
    if (!this.enabled) return none;
    const p = Array.from(this.getGamepads() ?? []).find(Boolean);
    if (!p) return none;
    const value = (i) => { const b = p.buttons[i]; return b == null ? 0 : typeof b === 'object' ? b.value : b; };
    const pressed = (i) => (value(i) > 0.5 ? 1 : 0);
    const edge = (i, action) => {
      const now = pressed(i) === 1;
      if (now && !this.padPrev[i]) actions.push(action);
      this.padPrev[i] = now;
    };
    edge(1, 'cut');
    edge(3, 'sas');
    edge(9, 'pause');
    return {
      throttle: value(7) - value(6),
      pitch: -deadzone(p.axes[1] ?? 0),
      yaw: deadzone(p.axes[0] ?? 0),
      fwd: pressed(12) - pressed(13),
      right: pressed(15) - pressed(14),
      look: [deadzone(p.axes[2] ?? 0), deadzone(p.axes[3] ?? 0)],
    };
  }

  update(dt) {
    const actions = this.queue.splice(0);
    const pad = this.readPad(actions);
    const delta = this.axis('throttleUp', 'throttleDown') + pad.throttle;
    this.throttle = clamp(this.throttle + delta * this.throttleRate * dt, 0, 1);
    const out = [];
    for (const a of actions) {
      if (a === 'fullThrottle') this.throttle = 1;
      else if (a === 'cut') this.throttle = 0;
      else out.push(a);
    }
    const intent = {
      pitch: clamp(this.axis('pitchFwd', 'pitchBack') + pad.pitch, -1, 1),
      yaw: clamp(this.axis('yawRight', 'yawLeft') + pad.yaw, -1, 1),
      fwd: clamp(this.axis('fwd', 'back') + pad.fwd, -1, 1),
      right: clamp(this.axis('right', 'left') + pad.right, -1, 1),
    };
    return { throttle: this.throttle, intent, actions: out, look: pad.look };
  }
}

function resolve(v, magnitude) {
  const m = Math.max(Math.abs(v[0]), Math.abs(v[1]));
  if (m < 1e-9 || magnitude === 0) return [0, 0];
  return [(v[0] / m) * magnitude, (v[1] / m) * magnitude];
}

// Tilting the nose toward a horizontal direction d needs a torque about cross(up, d).
export function mapControls(intent, frame, q) {
  const { forward, right, up } = frame;
  const torqueW = add(scale(cross(up, forward), intent.pitch), scale(cross(up, right), intent.yaw));
  const forceW = add(scale(forward, intent.fwd), scale(right, intent.right));
  const inv = conjugate(q);
  const tb = rotate(inv, torqueW), fb = rotate(inv, forceW);
  return {
    rot: resolve([tb[0], tb[1]], Math.min(1, Math.hypot(intent.pitch, intent.yaw))),
    trans: resolve([fb[0], fb[1]], Math.min(1, Math.hypot(intent.fwd, intent.right))),
  };
}

export function bodyControlFrame(q) {
  return { forward: rotate(q, [1, 0, 0]), right: rotate(q, [0, -1, 0]), up: rotate(q, [0, 0, 1]) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/input.js tests/input.test.js
git commit -m "feat: keyboard/gamepad input with camera- and body-relative control mapping"
```

---

### Task 13: Cube-sphere quadtree and chunk geometry (pure, Node-testable)

**Files:**
- Create: `src/render/planet/cubesphere.js`, `src/render/planet/quadtree.js`, `src/render/planet/chunk-builder.js`
- Test: `tests/planet.test.js`

These three files must not import Three.js: the chunk builder runs inside a Web Worker and in Node tests.

**Interfaces:**
- Consumes: vec3, `createTerrain` (tests only).
- Produces:
  - `cubesphere.js`: `FACES`, `faceDir(face, s, t) → unit dir` (s, t ∈ [−1, 1], tangent-warped), `nodeSize(level)`, `nodeKey(node) → 'face/level/x/y'`, `nodeCenterDir(node)`, `nodeEdgeLength(node, radius)`, `children(node)`, `parent(node)`, `roots()`, `dirToFaceST(dir) → { face, s, t }`, `nodeContaining(dir, level)`. A node is `{ face, level, x, y }`.
  - `quadtree.js`: `selectNodes({ cameraPos, radius, maxLevel, splitFactor = 1.5, maxTerrain = 2500, centerHeight = () => 0, isReady, request }) → { nodes, pending }`. A parent stays selected until all its (non-culled) children are ready; `request(node)` is called for every needed node that is not ready.
  - `chunk-builder.js`: `GRID = 33`, `VERTEX_COUNT`, `buildIndices() → Uint16Array` (shared by every chunk), `buildChunk(node, terrain, radius) → { center: [x,y,z] float64, positions: Float32Array (relative to center), normals: Float32Array, colors: Float32Array (linear RGB), boundingRadius }`.

- [ ] **Step 1: Write the failing test `tests/planet.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceDir, dirToFaceST, nodeKey, nodeContaining } from '../src/render/planet/cubesphere.js';
import { selectNodes } from '../src/render/planet/quadtree.js';
import { buildChunk, buildIndices, GRID, VERTEX_COUNT } from '../src/render/planet/chunk-builder.js';
import { createTerrain } from '../src/sim/terrain.js';
import { normalize, scale, length, dot } from '../src/math/vec3.js';

const R = 250000;
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('faceDir and dirToFaceST round trip on every face', () => {
  for (let face = 0; face < 6; face++) {
    for (const [s, t] of [[0, 0], [0.5, -0.3], [-0.9, 0.9]]) {
      const back = dirToFaceST(faceDir(face, s, t));
      assert.equal(back.face, face);
      close(back.s, s, 1e-9);
      close(back.t, t, 1e-9);
    }
  }
});

function noOverlap(nodes) {
  for (const a of nodes) for (const b of nodes) {
    if (a === b || a.face !== b.face || b.level <= a.level) continue;
    const k = b.level - a.level;
    assert.ok(!((b.x >> k) === a.x && (b.y >> k) === a.y), `${nodeKey(a)} overlaps ${nodeKey(b)}`);
  }
}

test('a low camera refines to the max level directly beneath it', () => {
  const dir = normalize([0.3, 0.4, 0.86]);
  const { nodes, pending } = selectNodes({ cameraPos: scale(dir, R + 50), radius: R, maxLevel: 14, isReady: () => true, request: () => {} });
  assert.equal(pending, 0);
  assert.ok(nodes.some((n) => nodeKey(n) === nodeKey(nodeContaining(dir, 14))));
  assert.ok(nodes.length < 800);
  noOverlap(nodes);
});

test('terrain height under the camera is respected when splitting', () => {
  const dir = normalize([0.3, 0.4, 0.86]);
  const { nodes } = selectNodes({ cameraPos: scale(dir, R + 900 + 50), radius: R, maxLevel: 14, centerHeight: () => 900, isReady: () => true, request: () => {} });
  assert.ok(nodes.some((n) => nodeKey(n) === nodeKey(nodeContaining(dir, 14))));
});

test('nothing ready: roots are requested and nothing is drawn', () => {
  const requested = [];
  const { nodes, pending } = selectNodes({ cameraPos: scale(normalize([0.3, 0.4, 0.86]), R + 50), radius: R, maxLevel: 14, isReady: () => false, request: (n) => requested.push(n) });
  assert.equal(nodes.length, 0);
  assert.ok(pending > 0);
  assert.ok(requested.some((n) => n.level === 0));
});

test('parents stay visible while children load', () => {
  const dir = normalize([0.3, 0.4, 0.86]);
  const { nodes, pending } = selectNodes({ cameraPos: scale(dir, R + 50), radius: R, maxLevel: 14, isReady: (n) => n.level <= 3, request: () => {} });
  assert.ok(nodes.length > 0);
  assert.ok(nodes.every((n) => n.level <= 3));
  assert.ok(pending > 0);
  noOverlap(nodes);
});

test('flat terrain chunk lies on the sphere with radial normals', () => {
  const c = buildChunk({ face: 4, level: 5, x: 10, y: 12 }, { height: () => 0 }, R);
  assert.equal(c.positions.length, VERTEX_COUNT * 3);
  for (let i = 0; i < GRID * GRID; i++) {
    const p = [c.positions[i * 3] + c.center[0], c.positions[i * 3 + 1] + c.center[1], c.positions[i * 3 + 2] + c.center[2]];
    close(length(p), R, 0.05);
    const n = [c.normals[i * 3], c.normals[i * 3 + 1], c.normals[i * 3 + 2]];
    close(dot(n, normalize(p)), 1, 1e-4);
  }
});

test('neighbouring chunks share their edge vertices', () => {
  const terrain = createTerrain({ seed: 3, radius: R });
  const a = buildChunk({ face: 0, level: 8, x: 100, y: 120 }, terrain, R);
  const b = buildChunk({ face: 0, level: 8, x: 101, y: 120 }, terrain, R);
  for (let j = 0; j < GRID; j++) {
    const ia = (j * GRID + GRID - 1) * 3, ib = j * GRID * 3;
    for (let c = 0; c < 3; c++) close(a.positions[ia + c] + a.center[c], b.positions[ib + c] + b.center[c], 0.02);
  }
});

test('indices cover the grid and both-sided skirts', () => {
  const idx = buildIndices();
  assert.equal(idx.length, (32 * 32 * 2 + 4 * 32 * 4) * 3);
  assert.ok(Math.max(...idx) < VERTEX_COUNT);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/render/planet/cubesphere.js'`.

- [ ] **Step 3: Implement `src/render/planet/cubesphere.js`**

```js
import { dot, normalize } from '../../math/vec3.js';

// Each face: outward normal n and in-plane axes u, v with cross(u, v) = n (outward winding).
export const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
  { n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [0, 1, 0], v: [-1, 0, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

export function faceDir(face, s, t) {
  const F = FACES[face];
  const a = Math.tan((s * Math.PI) / 4), b = Math.tan((t * Math.PI) / 4);
  return normalize([
    F.n[0] + F.u[0] * a + F.v[0] * b,
    F.n[1] + F.u[1] * a + F.v[1] * b,
    F.n[2] + F.u[2] * a + F.v[2] * b,
  ]);
}

export const nodeSize = (level) => 2 / 2 ** level;
export const nodeKey = (n) => `${n.face}/${n.level}/${n.x}/${n.y}`;

export function nodeCenterDir(n) {
  const size = nodeSize(n.level);
  return faceDir(n.face, -1 + (n.x + 0.5) * size, -1 + (n.y + 0.5) * size);
}

export const nodeEdgeLength = (n, radius) => (radius * (Math.PI / 2)) / 2 ** n.level;

export function children(n) {
  const level = n.level + 1, x = n.x * 2, y = n.y * 2, face = n.face;
  return [{ face, level, x, y }, { face, level, x: x + 1, y }, { face, level, x, y: y + 1 }, { face, level, x: x + 1, y: y + 1 }];
}

export const parent = (n) => (n.level === 0 ? null : { face: n.face, level: n.level - 1, x: n.x >> 1, y: n.y >> 1 });

export const roots = () => FACES.map((_, face) => ({ face, level: 0, x: 0, y: 0 }));

export function dirToFaceST(dir) {
  let face = 0, best = -Infinity;
  FACES.forEach((F, i) => {
    const d = dot(dir, F.n);
    if (d > best) { best = d; face = i; }
  });
  const F = FACES[face];
  const a = dot(dir, F.u) / best, b = dot(dir, F.v) / best;
  return { face, s: (Math.atan(a) * 4) / Math.PI, t: (Math.atan(b) * 4) / Math.PI };
}

export function nodeContaining(dir, level) {
  const { face, s, t } = dirToFaceST(dir);
  const n = 2 ** level;
  const cell = (v) => Math.min(n - 1, Math.max(0, Math.floor(((v + 1) / 2) * n)));
  return { face, level, x: cell(s), y: cell(t) };
}
```

- [ ] **Step 4: Implement `src/render/planet/quadtree.js`**

```js
import { length, scale, sub, angleBetween } from '../../math/vec3.js';
import { roots, children, nodeCenterDir, nodeEdgeLength } from './cubesphere.js';

export function selectNodes({ cameraPos, radius, maxLevel, splitFactor = 1.5, maxTerrain = 2500, centerHeight = () => 0, isReady, request }) {
  const nodes = [];
  let pending = 0;
  const camDist = length(cameraPos);
  const camDir = scale(cameraPos, 1 / camDist);
  const h = Math.max(1, camDist - radius);
  const horizon = Math.acos(radius / (radius + h)) + Math.acos(radius / (radius + maxTerrain));

  const culled = (n) => angleBetween(camDir, nodeCenterDir(n)) > horizon + ((Math.PI / 4) * 1.5) / 2 ** n.level;
  const wantsSplit = (n) => {
    if (n.level >= maxLevel) return false;
    const center = scale(nodeCenterDir(n), radius + centerHeight(n));
    return length(sub(cameraPos, center)) < splitFactor * nodeEdgeLength(n, radius);
  };

  const visit = (n) => {
    if (culled(n)) return;
    if (wantsSplit(n)) {
      const kids = children(n).filter((k) => !culled(k));
      let allReady = true;
      for (const k of kids) {
        if (!isReady(k)) { request(k); allReady = false; pending++; }
      }
      if (allReady) { kids.forEach(visit); return; }
    }
    if (isReady(n)) nodes.push(n);
    else { request(n); pending++; }
  };

  roots().forEach(visit);
  return { nodes, pending };
}
```

- [ ] **Step 5: Implement `src/render/planet/chunk-builder.js`**

```js
import { cross, dot, normalize, sub } from '../../math/vec3.js';
import { faceDir, nodeSize, nodeCenterDir, nodeEdgeLength } from './cubesphere.js';

export const GRID = 33;
const SEG = GRID - 1;
export const VERTEX_COUNT = GRID * GRID + 4 * GRID;

function edgeLists() {
  const v = (i, j) => j * GRID + i;
  const bottom = [], top = [], left = [], right = [];
  for (let k = 0; k < GRID; k++) {
    bottom.push(v(k, 0));
    top.push(v(k, SEG));
    left.push(v(0, k));
    right.push(v(SEG, k));
  }
  return [bottom, top, left, right];
}
const EDGES = edgeLists();

export function buildIndices() {
  const idx = [];
  const v = (i, j) => j * GRID + i;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
    idx.push(a, b, c, b, d, c);
  }
  EDGES.forEach((list, e) => {
    const base = GRID * GRID + e * GRID;
    for (let k = 0; k < SEG; k++) {
      const a = list[k], b = list[k + 1], c = base + k, d = base + k + 1;
      idx.push(a, b, c, b, d, c, a, c, b, b, c, d); // both windings so skirts show from either side
    }
  });
  return new Uint16Array(idx);
}

const srgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => (c / 255) ** 2.2);
const GROUND = srgb(0xbdb4da);
const STEEP = srgb(0x8b81b3);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildChunk(node, terrain, radius) {
  const size = nodeSize(node.level);
  const s0 = -1 + node.x * size, t0 = -1 + node.y * size, step = size / SEG;
  const E = GRID + 2; // one extra vertex on every side so normals match across chunk borders
  const pts = new Float64Array(E * E * 3), dirs = new Float64Array(E * E * 3);
  for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) {
    const d = faceDir(node.face, s0 + (i - 1) * step, t0 + (j - 1) * step);
    const r = radius + terrain.height(d);
    const o = (j * E + i) * 3;
    dirs[o] = d[0]; dirs[o + 1] = d[1]; dirs[o + 2] = d[2];
    pts[o] = d[0] * r; pts[o + 1] = d[1] * r; pts[o + 2] = d[2] * r;
  }
  const P = (i, j) => { const o = ((j + 1) * E + (i + 1)) * 3; return [pts[o], pts[o + 1], pts[o + 2]]; };
  const D = (i, j) => { const o = ((j + 1) * E + (i + 1)) * 3; return [dirs[o], dirs[o + 1], dirs[o + 2]]; };

  const cd = nodeCenterDir(node);
  const ch = radius + terrain.height(cd);
  const center = [cd[0] * ch, cd[1] * ch, cd[2] * ch];
  const positions = new Float32Array(VERTEX_COUNT * 3);
  const normals = new Float32Array(VERTEX_COUNT * 3);
  const colors = new Float32Array(VERTEX_COUNT * 3);

  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const o = (j * GRID + i) * 3;
    const p = P(i, j);
    const n = normalize(cross(sub(P(i + 1, j), P(i - 1, j)), sub(P(i, j + 1), P(i, j - 1))));
    const w = smoothstep(0.02, 0.12, 1 - dot(n, D(i, j)));
    for (let c = 0; c < 3; c++) {
      positions[o + c] = p[c] - center[c];
      normals[o + c] = n[c];
      colors[o + c] = GROUND[c] + (STEEP[c] - GROUND[c]) * w;
    }
  }

  const depth = nodeEdgeLength(node, radius) * 0.02 + 2;
  EDGES.forEach((list, e) => list.forEach((vi, k) => {
    const dst = (GRID * GRID + e * GRID + k) * 3, src = vi * 3;
    const i = vi % GRID, j = Math.floor(vi / GRID);
    const p = P(i, j), d = D(i, j);
    for (let c = 0; c < 3; c++) {
      positions[dst + c] = p[c] - d[c] * depth - center[c];
      normals[dst + c] = normals[src + c];
      colors[dst + c] = colors[src + c];
    }
  }));

  let boundingRadius = 0;
  for (let k = 0; k < positions.length; k += 3) {
    boundingRadius = Math.max(boundingRadius, Math.hypot(positions[k], positions[k + 1], positions[k + 2]));
  }
  return { center, positions, normals, colors, boundingRadius };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render/planet/cubesphere.js src/render/planet/quadtree.js src/render/planet/chunk-builder.js tests/planet.test.js
git commit -m "feat: cube-sphere quadtree LOD selection and chunk geometry builder"
```

---

### Task 14: Renderer core — toon materials, outline pass, sky, planet renderer, worker

**Files:**
- Create: `src/render/toon.js`, `src/render/scene.js`, `src/render/planet/chunk-worker.js`, `src/render/planet/planet-renderer.js`, `styles.css`, `debug.html`, `src/debug.js`

Browser-only code; verified by syntax checks plus looking at `debug.html`.

**Interfaces:**
- Consumes: Tasks 10 and 13.
- Produces:
  - `toon.js`: `PALETTE` (hex strings), `getGradientMap()`, `toonMaterial(color, opts?)`, `addOutline(mesh, thickness) → outlineMesh` (child of `mesh`), `class OutlinePass(renderer) { setSize(w, h), render(scene, camera) }`. Any object with `userData.noNormalPass = true` is hidden in the normal pass (plumes, markers, particles, outline shells).
  - `scene.js`: `class SceneRenderer(canvas) { renderer, scene, camera, camWorld, setSunDirection(dir), setCamera({ position, target, up, fov? }), toRender(world, out?) → THREE.Vector3, render(), resize(), clear() }`.
  - `planet-renderer.js`: `class PlanetRenderer(scene, { terrain, pads, workerCount? }) { update(cameraWorld) → { pending, visible, cached }, failed (string|null), dispose() }`.

- [ ] **Step 1: Implement `src/render/toon.js`**

```js
import * as THREE from 'three';

export const PALETTE = {
  ink: '#1e1838',
  sun: '#fff1dc',
  ambient: '#7d6fb8',
  skyTop: '#130f33',
  skyHorizon: '#5a4596',
  skyBelow: '#0b0920',
  star: '#f4efff',
  rocketBody: '#f6f1e7',
  rocketFoil: '#f2c14e',
  rocketAccent: '#ff6f59',
  rocketDark: '#3b3360',
  plumeOuter: '#ff9f43',
  plumeInner: '#fff4c2',
  rcsPuff: '#e8f3ff',
  target: '#4be3ac',
  hint: '#9ad0ff',
  impact: '#ff6f91',
  dust: '#cfc6e8',
};

let gradientMap = null;
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const steps = [90, 170, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradientMap = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export const toonMaterial = (color, opts = {}) => new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...opts });

const outlineMaterials = new Map();
function outlineMaterial(thickness) {
  if (outlineMaterials.has(thickness)) return outlineMaterials.get(thickness);
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(PALETTE.ink) }, thickness: { value: thickness } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float thickness;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec3 p = position + normal * thickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <logdepthbuf_fragment>
        #include <colorspace_fragment>
      }`,
  });
  outlineMaterials.set(thickness, m);
  return m;
}

export function addOutline(mesh, thickness = 0.05) {
  const shell = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  shell.userData.noNormalPass = true;
  shell.raycast = () => {};
  mesh.add(shell);
  return shell;
}

export class OutlinePass {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorTarget = new THREE.WebGLRenderTarget(1, 1);
    this.colorTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.colorTarget.depthTexture.type = THREE.UnsignedIntType;
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1);
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.prevClear = new THREE.Color();
    this.normalClear = new THREE.Color().setRGB(0.5, 0.5, 1);
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        tNormal: { value: this.normalTarget.texture },
        texel: { value: new THREE.Vector2(1, 1) },
        cameraFar: { value: 1 },
        inkColor: { value: new THREE.Color(PALETTE.ink) },
        depthThreshold: { value: 0.02 },
        normalThreshold: { value: 0.35 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth, tNormal;
        uniform vec2 texel;
        uniform float cameraFar, depthThreshold, normalThreshold;
        uniform vec3 inkColor;
        varying vec2 vUv;
        float viewZ(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return exp2(d * log2(cameraFar + 1.0)) - 1.0;
        }
        vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
        void main() {
          vec4 col = texture2D(tColor, vUv);
          vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
          float zc = viewZ(vUv);
          float ic = 1.0 / zc;
          float lap = abs(1.0 / viewZ(vUv - dx) + 1.0 / viewZ(vUv + dx) + 1.0 / viewZ(vUv - dy) + 1.0 / viewZ(vUv + dy) - 4.0 * ic) / ic;
          vec3 nc = nrm(vUv);
          float nd = max(max(1.0 - dot(nc, nrm(vUv - dx)), 1.0 - dot(nc, nrm(vUv + dx))),
                         max(1.0 - dot(nc, nrm(vUv - dy)), 1.0 - dot(nc, nrm(vUv + dy))));
          float edge = max(step(depthThreshold, lap), step(normalThreshold, nd));
          float fade = 1.0 - smoothstep(4000.0, 30000.0, zc);
          gl_FragColor = vec4(mix(col.rgb, inkColor, edge * fade * 0.85), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setSize(w, h) {
    this.colorTarget.setSize(w, h);
    this.normalTarget.setSize(w, h);
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.colorTarget);
    r.render(scene, camera);

    const hidden = [];
    scene.traverseVisible((o) => { if (o.userData.noNormalPass) hidden.push(o); });
    hidden.forEach((o) => { o.visible = false; });
    scene.overrideMaterial = this.normalMaterial;
    r.getClearColor(this.prevClear);
    const prevAlpha = r.getClearAlpha();
    r.setClearColor(this.normalClear, 1);
    r.setRenderTarget(this.normalTarget);
    r.render(scene, camera);
    r.setClearColor(this.prevClear, prevAlpha);
    scene.overrideMaterial = null;
    hidden.forEach((o) => { o.visible = true; });

    this.material.uniforms.cameraFar.value = camera.far;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}
```

- [ ] **Step 2: Implement `src/render/scene.js`**

```js
import * as THREE from 'three';
import { OutlinePass, PALETTE } from './toon.js';

const SKY_RADIUS = 2.5e6;

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      up: { value: new THREE.Vector3(0, 0, 1) },
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      below: { value: new THREE.Color(PALETTE.skyBelow) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 up, top, horizon, below;
      varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        float t = dot(normalize(vDir), up);
        vec3 c = t > 0.0 ? mix(horizon, top, pow(t, 0.45)) : mix(horizon, below, min(1.0, -t * 4.0));
        gl_FragColor = vec4(c, 1.0);
        #include <logdepthbuf_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.userData.noNormalPass = true;
  return sky;
}

function createStars(count = 1600) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([r * Math.cos(a) * SKY_RADIUS * 0.95, r * Math.sin(a) * SKY_RADIUS * 0.95, z * SKY_RADIUS * 0.95], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: PALETTE.star, size: 2, sizeAttenuation: false }));
  stars.frustumCulled = false;
  stars.userData.noNormalPass = true;
  return stars;
}

export class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(PALETTE.skyBelow, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 3e6);
    this.camWorld = [0, 0, 0];
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.9));
    this.sky = createSky();
    this.stars = createStars();
    this.scene.add(this.sky, this.stars);
    this.outline = new OutlinePass(this.renderer);
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.outline.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
  }

  setSunDirection(dir) {
    this.sun.position.set(dir[0] * 1000, dir[1] * 1000, dir[2] * 1000);
    this.sun.target.position.set(0, 0, 0);
  }

  setCamera({ position, target, up, fov }) {
    this.camWorld = position.slice();
    if (fov && fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(0, 0, 0);
    this.camera.up.set(up[0], up[1], up[2]);
    this.camera.lookAt(target[0] - position[0], target[1] - position[1], target[2] - position[2]);
    const l = Math.hypot(position[0], position[1], position[2]) || 1;
    this.sky.material.uniforms.up.value.set(position[0] / l, position[1] / l, position[2] / l);
  }

  toRender(world, out = new THREE.Vector3()) {
    return out.set(world[0] - this.camWorld[0], world[1] - this.camWorld[1], world[2] - this.camWorld[2]);
  }

  render() {
    this.outline.render(this.scene, this.camera);
  }

  clear() {
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
  }
}
```

- [ ] **Step 3: Implement `src/render/planet/chunk-worker.js`**

```js
import { createTerrain } from '../../sim/terrain.js';
import { buildChunk } from './chunk-builder.js';

let terrain = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    terrain = createTerrain({ seed: m.seed, radius: m.radius, pads: m.pads });
    return;
  }
  if (m.type === 'build') {
    const c = buildChunk(m.node, terrain, terrain.radius);
    self.postMessage(
      { key: m.key, center: c.center, positions: c.positions, normals: c.normals, colors: c.colors, boundingRadius: c.boundingRadius },
      [c.positions.buffer, c.normals.buffer, c.colors.buffer],
    );
  }
};
```

- [ ] **Step 4: Implement `src/render/planet/planet-renderer.js`**

```js
import * as THREE from 'three';
import { selectNodes } from './quadtree.js';
import { nodeKey, nodeCenterDir, parent } from './cubesphere.js';
import { buildIndices } from './chunk-builder.js';
import { getGradientMap } from '../toon.js';

const MAX_LEVEL = 14;
const CACHE_LIMIT = 1800;

export class PlanetRenderer {
  constructor(scene, { terrain, pads, workerCount }) {
    this.scene = scene;
    this.radius = terrain.radius;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.index = new THREE.BufferAttribute(buildIndices(), 1);
    this.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradientMap() });
    this.cache = new Map(); // key -> { node, state: 'pending'|'ready', mesh, center, used }
    this.queue = new Map();
    this.centerHeights = new Map();
    this.inFlight = 0;
    this.frame = 0;
    this.visible = [];
    this.failed = null;
    this.disposed = false;

    const n = workerCount ?? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.maxInFlight = n * 3;
    this.nextWorker = 0;
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./chunk-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onChunk(e.data);
      w.onerror = (e) => {
        this.failed = e.message || 'terrain worker failed to start';
        console.error(this.failed);
      };
      w.postMessage({ type: 'init', seed: terrain.seed, radius: this.radius, pads });
      return w;
    });

    this.isReady = (node) => this.cache.get(nodeKey(node))?.state === 'ready';
    this.request = (node) => {
      const key = nodeKey(node);
      if (!this.cache.has(key)) this.queue.set(key, node);
    };
    this.centerHeight = (node) => {
      const key = nodeKey(node);
      let h = this.centerHeights.get(key);
      if (h === undefined) {
        h = terrain.height(nodeCenterDir(node));
        this.centerHeights.set(key, h);
      }
      return h;
    };
  }

  update(cameraWorld) {
    this.frame++;
    this.queue.clear();
    const { nodes, pending } = selectNodes({
      cameraPos: cameraWorld, radius: this.radius, maxLevel: MAX_LEVEL,
      centerHeight: this.centerHeight, isReady: this.isReady, request: this.request,
    });
    for (const m of this.visible) m.visible = false;
    this.visible = [];
    for (const n of nodes) {
      const e = this.cache.get(nodeKey(n));
      e.mesh.visible = true;
      e.mesh.position.set(e.center[0] - cameraWorld[0], e.center[1] - cameraWorld[1], e.center[2] - cameraWorld[2]);
      this.visible.push(e.mesh);
      for (let p = n; p; p = parent(p)) {
        const a = this.cache.get(nodeKey(p));
        if (a) a.used = this.frame;
      }
    }
    this.pump(cameraWorld);
    this.evict();
    return { pending, visible: nodes.length, cached: this.cache.size };
  }

  pump(cameraWorld) {
    if (this.inFlight >= this.maxInFlight || this.queue.size === 0) return;
    const R = this.radius;
    const dist2 = (node) => {
      const d = nodeCenterDir(node);
      return (d[0] * R - cameraWorld[0]) ** 2 + (d[1] * R - cameraWorld[1]) ** 2 + (d[2] * R - cameraWorld[2]) ** 2;
    };
    const list = [...this.queue].map(([key, node]) => ({ key, node, d: dist2(node) })).sort((a, b) => a.d - b.d);
    for (const { key, node } of list) {
      if (this.inFlight >= this.maxInFlight) break;
      this.cache.set(key, { node, state: 'pending', used: this.frame });
      this.workers[this.nextWorker].postMessage({ type: 'build', key, node });
      this.nextWorker = (this.nextWorker + 1) % this.workers.length;
      this.inFlight++;
    }
  }

  onChunk(data) {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const entry = this.cache.get(data.key);
    if (!entry || this.disposed) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    g.setIndex(this.index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), data.boundingRadius);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.visible = false;
    this.group.add(mesh);
    Object.assign(entry, { state: 'ready', mesh, center: data.center });
  }

  evict() {
    if (this.cache.size <= CACHE_LIMIT) return;
    const old = [...this.cache].filter(([, e]) => e.state === 'ready' && e.used < this.frame).sort((a, b) => a[1].used - b[1].used);
    for (const [key, e] of old) {
      if (this.cache.size <= CACHE_LIMIT * 0.9) break;
      this.group.remove(e.mesh);
      e.mesh.geometry.dispose();
      this.cache.delete(key);
    }
  }

  dispose() {
    this.disposed = true;
    this.workers.forEach((w) => w.terminate());
    for (const e of this.cache.values()) if (e.mesh) e.mesh.geometry.dispose();
    this.cache.clear();
    this.scene.remove(this.group);
    this.material.dispose();
  }
}
```

- [ ] **Step 5: Create `styles.css` (base; Tasks 18 and 19 append to it)**

```css
:root {
  --ink: #1e1838;
  --panel: rgba(30, 24, 64, 0.62);
  --panel-edge: rgba(255, 255, 255, 0.14);
  --text: #f4efff;
  --muted: #b9b0d6;
  --good: #4be3ac;
  --warn: #ffd166;
  --bad: #ff6f91;
  --accent: #ff6f59;
  --hud-scale: 1;
  --font: ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif;
  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: radial-gradient(circle at 50% 120%, #5a4596, #130f33 60%);
  color: var(--text);
  font-family: var(--font);
}
#view { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
.hidden { display: none !important; }
#debug {
  position: fixed; left: 8px; bottom: 8px; z-index: 50;
  font: 12px var(--mono); background: rgba(0, 0, 0, 0.5); padding: 4px 8px; border-radius: 6px;
}
```

- [ ] **Step 6: Create `debug.html` and `src/debug.js` (a render test bench)**

`debug.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Munlendr render bench</title>
  <link rel="stylesheet" href="styles.css">
  <script type="importmap">{ "imports": { "three": "./vendor/three/three.module.js" } }</script>
</head>
<body>
  <canvas id="view"></canvas>
  <div id="debug"></div>
  <script type="module" src="src/debug.js"></script>
</body>
</html>
```

`src/debug.js`:
```js
import { SceneRenderer } from './render/scene.js';
import { PlanetRenderer } from './render/planet/planet-renderer.js';
import { getMission, buildWorld } from './game/missions.js';
import { tangentBasis } from './sim/frame.js';
import { add, scale } from './math/vec3.js';

const mission = getMission(Number(new URLSearchParams(location.search).get('mission') ?? 1));
const world = buildWorld(mission);
const sr = new SceneRenderer(document.getElementById('view'));
sr.setSunDirection(world.sunDir);
const planet = new PlanetRenderer(sr.scene, { terrain: world.terrain, pads: world.pads });
const info = document.getElementById('debug');
const { east, north } = tangentBasis(world.siteDir);
const ground = world.body.surfaceRadius(world.siteDir);
const start = performance.now();

function frame(now) {
  const t = (now - start) / 1000;
  const alt = 400 + 1200 * (0.5 + 0.5 * Math.sin(t * 0.15));
  const offset = add(scale(east, Math.cos(t * 0.05) * 2500), scale(north, Math.sin(t * 0.05) * 2500));
  const position = add(scale(world.siteDir, ground + alt), offset);
  sr.setCamera({ position, target: world.sitePoint, up: world.siteDir });
  const st = planet.update(position);
  info.textContent = `chunks ${st.visible}  pending ${st.pending}  cached ${st.cached}  alt ${alt.toFixed(0)} m${planet.failed ? '  ERROR ' + planet.failed : ''}`;
  sr.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 7: Syntax-check and run the unit tests**

Run:
```bash
for f in src/render/toon.js src/render/scene.js src/render/planet/chunk-worker.js src/render/planet/planet-renderer.js src/debug.js; do node --check "$f" || exit 1; done
npm test
```
Expected: no syntax errors; all tests PASS.

- [ ] **Step 8: Look at it in a browser**

Run `npm run serve`, open `http://localhost:8080/debug.html`.
Expected: within a few seconds a lilac, cel-shaded cratered moon surface appears under a violet-to-indigo sky with stars; crater rims and the horizon have dark ink lines; the camera slowly circles the site; the overlay shows `pending` dropping to 0 and no `ERROR`; the browser console has no errors.
If no person can look, capture a screenshot with headless Chrome (path differs per OS) and inspect it with the image viewer:
```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --enable-unsafe-swiftshader --window-size=1280,720 --virtual-time-budget=20000 --screenshot="$TEMP/bench.png" http://localhost:8080/debug.html
```

- [ ] **Step 9: Commit**

```bash
git add src/render/toon.js src/render/scene.js src/render/planet/chunk-worker.js src/render/planet/planet-renderer.js styles.css debug.html src/debug.js
git commit -m "feat: toon renderer with outline pass, sky and worker-built LOD planet"
```

---

### Task 15: Rocket model, plumes, markers, dust and debris

**Files:**
- Create: `src/render/plumes.js`, `src/render/rocket-model.js`, `src/render/markers.js`, `src/render/dust.js`, `src/render/debris.js`
- Modify: `src/debug.js` (replace the whole file to show the rocket)

**Interfaces:**
- Consumes: `toon.js`, `SceneRenderer.toRender`, `THRUSTERS`, `CONFIG.legs.feet`, `tangentBasis`.
- Produces:
  - `plumes.js`: `createMainPlume() → THREE.Group` (extends along local −Z from z = 0; scale.z = length), `createPuff() → THREE.Mesh` (extends along local −Y).
  - `rocket-model.js`: `createRocketModel() → { root, body, parts, puffs, plume }` (root sits at the CoM and takes the sim quaternion; body is offset by −zcm); `updateRocketModel(model, { renderPos, q, zcm, engineOn, throttle, thrusters, time })`.
  - `markers.js`: `class Markers(scene) { setTarget(point, up, radius), setPadHints(hints), update(sr, { rocketPos, groundPoint, up, impact: { point, up } | null }), dispose() }`.
  - `dust.js`: `class Dust(scene, count?) { update(dt, sr, { active, groundPoint, up, intensity }), dispose() }`.
  - `debris.js`: `class Debris(scene) { explode(model, sr, { origin, velocity, up }), update(dt, sr, body), dispose() }`.

- [ ] **Step 1: Implement `src/render/plumes.js`**

```js
import * as THREE from 'three';
import { PALETTE } from './toon.js';

const additive = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

export function createMainPlume() {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1, 16, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2), additive(PALETTE.plumeOuter, 0.7));
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 12, 1, true).translate(0, 0.35, 0).rotateX(-Math.PI / 2), additive(PALETTE.plumeInner, 0.95));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), additive(PALETTE.plumeOuter, 0.5));
  glow.scale.set(1, 1, 0.3);
  group.add(outer, inner, glow);
  group.traverse((o) => { o.userData.noNormalPass = true; });
  group.visible = false;
  return group;
}

export function createPuff() {
  const puff = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 8, 1, true).translate(0, -0.45, 0), additive(PALETTE.rcsPuff, 0.8));
  puff.userData.noNormalPass = true;
  puff.visible = false;
  return puff;
}
```

- [ ] **Step 2: Implement `src/render/rocket-model.js`**

```js
import * as THREE from 'three';
import { toonMaterial, addOutline, PALETTE } from './toon.js';
import { createMainPlume, createPuff } from './plumes.js';
import { THRUSTERS } from '../sim/actuators.js';
import { CONFIG } from '../config.js';

const Y = new THREE.Vector3(0, 1, 0);

function strut(a, b, radius, material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, A.distanceTo(B), 6), material);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y, B.clone().sub(A).normalize());
  return mesh;
}

// Built in the body frame: +Z is the rocket axis, geometric centre at the origin, spans z = -3..3.
export function createRocketModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const foil = toonMaterial(PALETTE.rocketFoil);
  const white = toonMaterial(PALETTE.rocketBody);
  const accent = toonMaterial(PALETTE.rocketAccent);
  const dark = toonMaterial(PALETTE.rocketDark, { side: THREE.DoubleSide });
  const parts = [];
  const part = (mesh, outline = 0.06) => {
    body.add(mesh);
    if (outline) addOutline(mesh, outline);
    parts.push(mesh);
    return mesh;
  };

  part(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.6, 8).rotateX(Math.PI / 2).translate(0, 0, -1.6), foil));
  part(new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, 0.22, 8).rotateX(Math.PI / 2).translate(0, 0, -0.42), accent), 0.03);
  part(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.35, 2.2, 10).rotateX(Math.PI / 2).translate(0, 0, 0.9), white));
  part(new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 2.0), white));
  part(new THREE.Mesh(new THREE.CircleGeometry(0.32, 16).rotateY(Math.PI / 2).translate(1.15, 0, 1.15), dark), 0);
  part(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4).rotateX(Math.PI / 2).translate(0.4, 0.3, 3.1), dark), 0.02);
  part(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 0.5, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, -2.95), dark), 0.03);

  for (const f of CONFIG.legs.feet) {
    part(strut([f[0] * 0.62, f[1] * 0.62, -0.9], f, 0.09, foil), 0.03);
    part(strut([f[0] * 0.6, f[1] * 0.6, -2.85], [f[0] * 0.85, f[1] * 0.85, -3.25], 0.06, dark), 0.02);
    part(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.1, 10).rotateX(Math.PI / 2).translate(f[0], f[1], f[2] + 0.05), dark), 0.03);
  }

  const puffs = THRUSTERS.map((t) => {
    const ringZ = t.ring === 'top' ? 2.2 : -2.2;
    const ringR = t.ring === 'top' ? 1.12 : 1.55;
    const d = [0, 0, 0];
    d[t.axis] = t.sign;
    const pos = new THREE.Vector3(-d[0] * ringR, -d[1] * ringR, ringZ); // a thruster pushing +d sits on the -d side
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.36), dark);
    pod.position.copy(pos);
    part(pod, 0.02);
    const puff = createPuff();
    puff.position.copy(pos);
    puff.quaternion.setFromUnitVectors(Y, new THREE.Vector3(...d)); // puff extends along -d (outward)
    body.add(puff);
    return puff;
  });

  const plume = createMainPlume();
  plume.position.set(0, 0, -3.2);
  body.add(plume);

  return { root, body, parts, puffs, plume };
}

export function updateRocketModel(model, { renderPos, q, zcm, engineOn, throttle, thrusters, time }) {
  model.root.position.copy(renderPos);
  model.root.quaternion.set(q[1], q[2], q[3], q[0]);
  model.body.position.set(0, 0, -zcm);
  const on = engineOn && throttle > 0;
  model.plume.visible = on;
  if (on) {
    const w = 0.8 + 0.4 * throttle;
    const flicker = 0.92 + 0.08 * Math.sin(time * 47) + 0.04 * Math.sin(time * 113);
    model.plume.scale.set(w, w, (2 + 9 * throttle) * flicker);
  }
  model.puffs.forEach((p, i) => {
    const o = thrusters[i];
    p.visible = o > 0.05;
    if (p.visible) p.scale.set(o, 0.6 + 1.4 * o, o);
  });
}
```

- [ ] **Step 3: Implement `src/render/markers.js`**

```js
import * as THREE from 'three';
import { PALETTE } from './toon.js';

const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

const flatMaterial = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });

function groundRing(inner, outer, color, opacity) {
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), flatMaterial(color, opacity));
  m.userData.noNormalPass = true;
  return m;
}

function orient(mesh, up, axis = Z) {
  mesh.quaternion.setFromUnitVectors(axis, tmp.set(up[0], up[1], up[2]));
}

const lift = (p, up, h) => [p[0] + up[0] * h, p[1] + up[1] * h, p[2] + up[2] * h];

export class Markers {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.groundDot = groundRing(1.2, 1.9, PALETTE.hint, 0.9);
    this.dropGeo = new THREE.BufferGeometry();
    this.dropGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.drop = new THREE.Line(this.dropGeo, new THREE.LineDashedMaterial({ color: PALETTE.hint, dashSize: 2, gapSize: 1.5, transparent: true, opacity: 0.8 }));
    this.drop.userData.noNormalPass = true;
    this.drop.frustumCulled = false;
    this.impact = groundRing(3, 4.2, PALETTE.impact, 0.85);
    this.impact.visible = false;
    this.group.add(this.groundDot, this.drop, this.impact);
  }

  place(mesh, world, up, height = 0.3) {
    this.items.push({ mesh, world: lift(world, up, height) });
    this.group.add(mesh);
  }

  setTarget(point, up, radius) {
    const ring = groundRing(radius - 3, radius, PALETTE.target, 0.9);
    orient(ring, up);
    this.place(ring, point, up);
    const core = groundRing(0, 2.5, PALETTE.target, 0.9);
    orient(core, up);
    this.place(core, point, up);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 400, 8, 1, true), flatMaterial(PALETTE.target, 0.35));
    beacon.userData.noNormalPass = true;
    orient(beacon, up, Y);
    this.place(beacon, point, up, 200);
  }

  setPadHints(hints) {
    for (const h of hints) {
      const ring = groundRing(h.radius - 2, h.radius, PALETTE.hint, 0.45);
      orient(ring, h.up);
      this.place(ring, h.point, h.up);
    }
  }

  update(sr, { rocketPos, groundPoint, up, impact }) {
    for (const it of this.items) sr.toRender(it.world, it.mesh.position);
    sr.toRender(lift(groundPoint, up, 0.2), this.groundDot.position);
    orient(this.groundDot, up);
    const a = sr.toRender(rocketPos), b = this.groundDot.position;
    this.dropGeo.attributes.position.array.set([a.x, a.y, a.z, b.x, b.y, b.z]);
    this.dropGeo.attributes.position.needsUpdate = true;
    this.drop.computeLineDistances();
    this.impact.visible = !!impact;
    if (impact) {
      sr.toRender(lift(impact.point, impact.up, 0.3), this.impact.position);
      orient(this.impact, impact.up);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
```

- [ ] **Step 4: Implement `src/render/dust.js`**

```js
import * as THREE from 'three';
import { PALETTE } from './toon.js';
import { tangentBasis } from '../sim/frame.js';

const FAR = 1e7; // beyond the far plane: parks dead particles out of view
const G = 1.62;

export class Dust {
  constructor(scene, count = 240) {
    this.scene = scene;
    this.count = count;
    this.pos = new Float64Array(count * 3);
    this.vel = new Float64Array(count * 3);
    this.life = new Float32Array(count);
    this.up = [0, 0, 1];
    this.next = 0;
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(count * 3).fill(FAR), 3);
    this.geo.setAttribute('position', this.attr);
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ color: PALETTE.dust, size: 1.4, transparent: true, opacity: 0.75, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.userData.noNormalPass = true;
    scene.add(this.points);
  }

  update(dt, sr, { active, groundPoint, up, intensity }) {
    if (active && dt > 0) {
      this.up = up;
      const { east, north } = tangentBasis(up);
      const n = Math.ceil(intensity * 8);
      for (let k = 0; k < n; k++) {
        const i = this.next;
        this.next = (this.next + 1) % this.count;
        const a = Math.random() * Math.PI * 2, speed = 8 + Math.random() * 10, rise = 1 + Math.random() * 3;
        for (let c = 0; c < 3; c++) {
          this.pos[i * 3 + c] = groundPoint[c] + up[c] * 0.3;
          this.vel[i * 3 + c] = (east[c] * Math.cos(a) + north[c] * Math.sin(a)) * speed + up[c] * rise;
        }
        this.life[i] = 1.2 + Math.random() * 0.6;
      }
    }
    const arr = this.attr.array, cam = sr.camWorld;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] > 0) {
        this.life[i] -= dt;
        for (let c = 0; c < 3; c++) {
          this.vel[i * 3 + c] -= this.up[c] * G * dt;
          this.pos[i * 3 + c] += this.vel[i * 3 + c] * dt;
          arr[i * 3 + c] = this.pos[i * 3 + c] - cam[c];
        }
      } else {
        arr[i * 3] = FAR; arr[i * 3 + 1] = FAR; arr[i * 3 + 2] = FAR;
      }
    }
    this.attr.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.points.material.dispose();
  }
}
```

- [ ] **Step 5: Implement `src/render/debris.js`**

```js
import * as THREE from 'three';
import { length, normalize } from '../math/vec3.js';

const G = 1.62;

function makeFlash() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.4, 'rgba(255,170,80,0.8)');
  g.addColorStop(1, 'rgba(255,120,60,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  s.userData.noNormalPass = true;
  return s;
}

export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.pieces = [];
    this.up = [0, 0, 1];
    this.flash = makeFlash();
    this.flash.visible = false;
    this.flashT = 0;
    this.flashWorld = [0, 0, 0];
    this.group.add(this.flash);
  }

  explode(model, sr, { origin, velocity, up }) {
    model.root.updateMatrixWorld(true);
    model.plume.visible = false;
    model.puffs.forEach((p) => { p.visible = false; });
    const cam = sr.camWorld;
    for (const part of [...model.parts]) {
      const wp = part.getWorldPosition(new THREE.Vector3());
      const wq = part.getWorldQuaternion(new THREE.Quaternion());
      this.group.add(part);
      part.position.copy(wp);
      part.quaternion.copy(wq);
      const world = [wp.x + cam[0], wp.y + cam[1], wp.z + cam[2]];
      const out = normalize([world[0] - origin[0] + Math.random() - 0.5, world[1] - origin[1] + Math.random() - 0.5, world[2] - origin[2] + Math.random() - 0.5]);
      const speed = 4 + Math.random() * 10, rise = 3 + Math.random() * 6;
      const vel = [0, 1, 2].map((c) => velocity[c] * 0.3 + out[c] * speed + up[c] * rise);
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this.pieces.push({ mesh: part, world, vel, spin, rate: (1 + Math.random() * 2) * Math.PI });
    }
    this.up = up;
    this.flashWorld = origin.slice();
    this.flashT = 0;
    this.flash.visible = true;
  }

  update(dt, sr, body) {
    for (const p of this.pieces) {
      for (let c = 0; c < 3; c++) {
        p.vel[c] -= this.up[c] * G * dt;
        p.world[c] += p.vel[c] * dt;
      }
      const r = length(p.world);
      const dir = [p.world[0] / r, p.world[1] / r, p.world[2] / r];
      const ground = body.surfaceRadius(dir) + 0.3;
      if (r < ground) {
        p.world = [dir[0] * ground, dir[1] * ground, dir[2] * ground];
        const vn = p.vel[0] * dir[0] + p.vel[1] * dir[1] + p.vel[2] * dir[2];
        for (let c = 0; c < 3; c++) p.vel[c] = (p.vel[c] - dir[c] * vn * 1.4) * 0.6;
        p.rate *= 0.7;
      }
      sr.toRender(p.world, p.mesh.position);
      p.mesh.rotateOnAxis(p.spin, p.rate * dt);
    }
    if (this.flash.visible) {
      this.flashT += dt;
      const s = 4 + this.flashT * 60;
      this.flash.scale.set(s, s, s);
      this.flash.material.opacity = Math.max(0, 1 - this.flashT / 0.7);
      sr.toRender(this.flashWorld, this.flash.position);
      if (this.flashT > 0.7) this.flash.visible = false;
    }
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
```

- [ ] **Step 6: Replace `src/debug.js` to show the rocket**

```js
import { SceneRenderer } from './render/scene.js';
import { PlanetRenderer } from './render/planet/planet-renderer.js';
import { createRocketModel, updateRocketModel } from './render/rocket-model.js';
import { Markers } from './render/markers.js';
import { Dust } from './render/dust.js';
import { Debris } from './render/debris.js';
import { getMission, buildWorld } from './game/missions.js';
import { tangentBasis } from './sim/frame.js';
import { fromBasis } from './math/quat.js';
import { add, scale } from './math/vec3.js';

const mission = getMission(Number(new URLSearchParams(location.search).get('mission') ?? 1));
const world = buildWorld(mission);
const sr = new SceneRenderer(document.getElementById('view'));
sr.setSunDirection(world.sunDir);
const planet = new PlanetRenderer(sr.scene, { terrain: world.terrain, pads: world.pads });
const model = createRocketModel();
sr.scene.add(model.root);
const markers = new Markers(sr.scene);
markers.setTarget(world.sitePoint, world.siteDir, mission.targetPad.radius);
markers.setPadHints(world.padHints);
const dust = new Dust(sr.scene);
const debris = new Debris(sr.scene);
const info = document.getElementById('debug');
const up = world.siteDir;
const { east, north } = tangentBasis(up);
const q = fromBasis(east, north, up);
const rocketPos = scale(up, world.body.surfaceRadius(up) + 12);
let exploded = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyK' && !exploded) {
    exploded = true;
    debris.explode(model, sr, { origin: rocketPos, velocity: [0, 0, 0], up });
  }
});

let last = performance.now();
function frame(now) {
  const t = now / 1000, dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const camPos = add(rocketPos, add(scale(east, Math.cos(t * 0.2) * 30), add(scale(north, Math.sin(t * 0.2) * 30), scale(up, 8))));
  sr.setCamera({ position: camPos, target: rocketPos, up });
  const st = planet.update(camPos);
  const throttle = 0.5 + 0.5 * Math.sin(t);
  const thrusters = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (Math.floor(t * 2) % 8 === i ? 1 : 0));
  if (!exploded) updateRocketModel(model, { renderPos: sr.toRender(rocketPos), q, zcm: 0, engineOn: true, throttle, thrusters, time: t });
  markers.update(sr, { rocketPos, groundPoint: world.sitePoint, up, impact: { point: add(world.sitePoint, scale(east, 15)), up } });
  dust.update(dt, sr, { active: !exploded, groundPoint: world.sitePoint, up, intensity: throttle });
  debris.update(dt, sr, world.body);
  info.textContent = `chunks ${st.visible}  pending ${st.pending}  throttle ${throttle.toFixed(2)}  (K = explode)`;
  sr.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 7: Syntax-check, run tests, look at it**

Run:
```bash
for f in src/render/plumes.js src/render/rocket-model.js src/render/markers.js src/render/dust.js src/render/debris.js src/debug.js; do node --check "$f" || exit 1; done
npm test
```
Then open `http://localhost:8080/debug.html` (`npm run serve`).
Expected: a white-and-gold cel-shaded lander with ink outlines hovers 12 m above the green target ring and beacon; an orange plume pulses below it; one RCS puff at a time blinks around the top and bottom rings; dust sprays outward on the ground; a dashed line drops to a small blue ground dot; a pink impact ring sits 15 m east; pressing K blows the lander into tumbling parts with a flash. No console errors. (Use the headless screenshot command from Task 14 if no person can look.)

- [ ] **Step 8: Commit**

```bash
git add src/render/plumes.js src/render/rocket-model.js src/render/markers.js src/render/dust.js src/render/debris.js src/debug.js
git commit -m "feat: toon rocket model, plumes, markers, dust and crash debris"
```

---

### Task 16: Cameras

**Files:**
- Create: `src/render/cameras.js`
- Test: `tests/cameras.test.js`

`cameras.js` must not import Three.js (it is pure math plus optional DOM listeners) so Node can test it.

**Interfaces:**
- Consumes: vec3, `tangentBasis`.
- Produces: `VIEW_ORDER = ['chase', 'orbit', 'topdown', 'surface']`, `VIEW_LABELS`, `defaultViews()`, `computePose(name, viewState, ctx) → { position, target, up, fov }` where `ctx = { rocketPos, heading, siteDir, sitePoint }`; `controlFrame(pose, rocketPos) → { forward, right, up }`; `class CameraRig(views?) { active, views, heading, invertDrag, cycle() → name, orbit(dxDeg, dyDeg), zoom(steps), updateHeading(rocketPos, velocity, dt), pose(ctx), attach(element), detach() }`. Each view keeps its own `{ yaw, pitch, dist }` (for `surface`, `dist` is the field of view in degrees).

- [ ] **Step 1: Write the failing test `tests/cameras.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig, controlFrame, VIEW_ORDER } from '../src/render/cameras.js';
import { latLonToDir, tangentBasis } from '../src/sim/frame.js';
import { scale, sub, dot, add } from '../src/math/vec3.js';

const R = 250000;
const site = latLonToDir(8, 23);
const { east, north } = tangentBasis(site);
const sitePoint = scale(site, R);
const rocketPos = scale(site, R + 100);
const ctx = { rocketPos, siteDir: site, sitePoint };

test('chase sits behind and above a rocket moving east; W means east', () => {
  const rig = new CameraRig();
  for (let i = 0; i < 10; i++) rig.updateHeading(rocketPos, scale(east, 30), 0.5);
  const pose = rig.pose(ctx);
  const rel = sub(pose.position, rocketPos);
  assert.ok(dot(rel, east) < 0);
  assert.ok(dot(rel, site) > 0);
  assert.ok(dot(controlFrame(pose, rocketPos).forward, east) > 0.99);
});

test('top-down looks down at the site with north as screen-up', () => {
  const rig = new CameraRig();
  rig.active = 'topdown';
  rig.updateHeading(rocketPos, [0, 0, 0], 0.1);
  const near = add(rocketPos, scale(east, 300));
  const pose = rig.pose({ ...ctx, rocketPos: near });
  assert.ok(dot(sub(pose.position, sitePoint), site) > 100);
  assert.ok(dot(controlFrame(pose, near).forward, north) > 0.99);
});

test('surface view uses its dist as the field of view', () => {
  const rig = new CameraRig();
  rig.active = 'surface';
  rig.updateHeading(rocketPos, [0, 0, 0], 0.1);
  assert.equal(rig.pose(ctx).fov, rig.views.surface.dist);
});

test('each view keeps its own orbit and zoom', () => {
  const rig = new CameraRig();
  rig.active = 'orbit';
  const yaw0 = rig.views.orbit.yaw;
  rig.orbit(30, 0);
  rig.zoom(2);
  assert.equal(rig.views.orbit.yaw, (yaw0 + 30) % 360);
  assert.equal(rig.views.chase.yaw, 0);
  rig.cycle(); rig.cycle(); rig.cycle(); rig.cycle();
  assert.equal(rig.active, 'orbit');
  assert.equal(rig.views.orbit.yaw, (yaw0 + 30) % 360);
});

test('zoom and pitch are clamped; invert flips drag', () => {
  const rig = new CameraRig();
  rig.zoom(1000);
  assert.equal(rig.views.chase.dist, 400);
  rig.orbit(0, 1000);
  assert.equal(rig.views.chase.pitch, 85);
  rig.invertDrag = true;
  rig.orbit(10, 0);
  assert.equal(rig.views.chase.yaw, 350);
});

test('cycle order', () => {
  const rig = new CameraRig();
  assert.deepEqual(VIEW_ORDER.slice(1).map(() => rig.cycle()), ['orbit', 'topdown', 'surface']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/render/cameras.js'`.

- [ ] **Step 3: Implement `src/render/cameras.js`**

```js
import { add, scale, sub, normalize, cross, dot, length, DEG } from '../math/vec3.js';
import { tangentBasis } from '../sim/frame.js';

export const VIEW_ORDER = ['chase', 'orbit', 'topdown', 'surface'];
export const VIEW_LABELS = { chase: 'Chase', orbit: 'Orbit', topdown: 'Top-down', surface: 'Surface' };

const LIMITS = {
  chase: { pitch: [-10, 85], dist: [12, 400] },
  orbit: { pitch: [-10, 89], dist: [12, 3000] },
  topdown: { pitch: [0, 0], dist: [60, 20000] },
  surface: { pitch: [0, 0], dist: [10, 75] },
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function defaultViews() {
  return {
    chase: { yaw: 0, pitch: 18, dist: 45 },
    orbit: { yaw: 210, pitch: 25, dist: 80 },
    topdown: { yaw: 0, pitch: 0, dist: 900 },
    surface: { yaw: 200, pitch: 0, dist: 55 },
  };
}

// yaw 0 = north, 90 = east
const horizontalDir = (yawDeg, east, north) => add(scale(north, Math.cos(yawDeg * DEG)), scale(east, Math.sin(yawDeg * DEG)));

function rotateAboutUp(h, up, yawDeg) {
  const side = cross(h, up);
  return add(scale(h, Math.cos(yawDeg * DEG)), scale(side, Math.sin(yawDeg * DEG)));
}

export function computePose(name, v, ctx) {
  const up = normalize(ctx.rocketPos);
  const { east, north } = tangentBasis(up);
  switch (name) {
    case 'chase': {
      const h = rotateAboutUp(ctx.heading ?? north, up, v.yaw);
      const p = v.pitch * DEG;
      const dir = add(scale(h, -Math.cos(p)), scale(up, Math.sin(p)));
      return { position: add(ctx.rocketPos, scale(dir, v.dist)), target: ctx.rocketPos, up, fov: 60 };
    }
    case 'orbit': {
      const p = v.pitch * DEG;
      const dir = add(scale(horizontalDir(v.yaw, east, north), Math.cos(p)), scale(up, Math.sin(p)));
      return { position: add(ctx.rocketPos, scale(dir, v.dist)), target: ctx.rocketPos, up, fov: 60 };
    }
    case 'topdown': {
      const b = tangentBasis(ctx.siteDir);
      return { position: add(ctx.sitePoint, scale(ctx.siteDir, v.dist)), target: ctx.sitePoint, up: horizontalDir(v.yaw, b.east, b.north), fov: 50 };
    }
    case 'surface': {
      const b = tangentBasis(ctx.siteDir);
      const position = add(add(ctx.sitePoint, scale(ctx.siteDir, 2)), scale(horizontalDir(v.yaw, b.east, b.north), 30));
      return { position, target: ctx.rocketPos, up: ctx.siteDir, fov: v.dist };
    }
    default:
      throw new Error(`unknown camera view ${name}`);
  }
}

export function controlFrame(pose, rocketPos) {
  const up = normalize(rocketPos);
  const look = sub(pose.target, pose.position);
  let f = sub(look, scale(up, dot(look, up)));
  if (length(f) < 0.2 * length(look)) f = sub(pose.up, scale(up, dot(pose.up, up))); // looking almost straight down
  const forward = normalize(f);
  return { forward, right: cross(forward, up), up };
}

export class CameraRig {
  constructor(views = defaultViews()) {
    this.views = views;
    this.active = 'chase';
    this.heading = null;
    this.invertDrag = false;
    this.drag = null;
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
  }

  cycle() {
    this.active = VIEW_ORDER[(VIEW_ORDER.indexOf(this.active) + 1) % VIEW_ORDER.length];
    return this.active;
  }

  orbit(dxDeg, dyDeg) {
    const v = this.views[this.active], L = LIMITS[this.active], s = this.invertDrag ? -1 : 1;
    v.yaw = (((v.yaw + dxDeg * s) % 360) + 360) % 360;
    v.pitch = clamp(v.pitch + dyDeg * s, L.pitch[0], L.pitch[1]);
  }

  zoom(steps) {
    const v = this.views[this.active], L = LIMITS[this.active];
    v.dist = clamp(v.dist * 1.15 ** steps, L.dist[0], L.dist[1]);
  }

  updateHeading(rocketPos, velocity, dt) {
    const up = normalize(rocketPos);
    const flat = (x) => sub(x, scale(up, dot(x, up)));
    const vh = flat(velocity);
    let h = this.heading ? flat(this.heading) : null;
    if (!h || length(h) < 1e-6) h = length(vh) > 0.5 ? vh : tangentBasis(up).north;
    h = normalize(h);
    if (length(vh) > 1) {
      const k = Math.min(1, dt * 1.5);
      h = normalize(add(scale(h, 1 - k), scale(normalize(vh), k)));
    }
    this.heading = h;
  }

  pose(ctx) {
    return computePose(this.active, this.views[this.active], { ...ctx, heading: this.heading });
  }

  attach(el) {
    this.el = el;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detach() {
    if (!this.el) return;
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('pointercancel', this.onPointerUp);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el = null;
  }

  onPointerDown(e) {
    this.drag = { x: e.clientX, y: e.clientY };
    e.target.setPointerCapture?.(e.pointerId);
  }

  onPointerMove(e) {
    if (!this.drag) return;
    this.orbit((e.clientX - this.drag.x) * 0.3, (e.clientY - this.drag.y) * 0.3);
    this.drag = { x: e.clientX, y: e.clientY };
  }

  onPointerUp() {
    this.drag = null;
  }

  onWheel(e) {
    e.preventDefault();
    this.zoom(Math.sign(e.deltaY));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/cameras.js tests/cameras.test.js
git commit -m "feat: four camera views with per-view orbit/zoom and control frames"
```

---

### Task 17: Flight session and a playable flight

**Files:**
- Create: `src/game/session.js`, `src/flight.js`, `index.html`, `src/main.js` (temporary quick-start; replaced in Task 19)
- Modify: `styles.css` (append)
- Test: `tests/session.test.js`

**Interfaces:**
- Consumes: Tasks 6–16.
- Produces:
  - `session.js`: `class FlightSession({ mission, difficulty, cfg?, world? })` with `world`, `state`, `prev`, `judge`, `sas` (boolean, starts at `mission.sasOn`), `lastStep`, `outcome` (null until the end), `aidsAvailable` getter, `step(dt, cmd)`, `snapshot(alpha)` (interpolated state), `result() → { outcome: 'landed'|'crashed', grade, reason, checks, fuel, distance, time, score: { total, parts, multiplier }, medal }`.
  - `flight.js`: `class Flight({ sceneRenderer, input, mission, difficulty, settings, hud?, onEnd(result), onPauseRequest() })` with `load(onProgress(pending)) → Promise`, `start()`, `pause()`, `resume()`, `applySettings(settings)`, `dispose()`; fields `session`, `ui = { aids, vehicleView, hudVisible }`, `rig`, `predictions`.

- [ ] **Step 1: Write the failing test `tests/session.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlightSession } from '../src/game/session.js';
import { getMission } from '../src/game/missions.js';
import { cloneState } from '../src/sim/rocket.js';
import { tangentBasis } from '../src/sim/frame.js';
import { fromBasis } from '../src/math/quat.js';
import { scale, dot, normalize, length, sub } from '../src/math/vec3.js';

const dt = 1 / 120;

function placeOverPad(s, feetAbove, vDown) {
  const up = s.world.siteDir;
  const { east, north } = tangentBasis(up);
  Object.assign(s.state, { r: scale(up, s.world.body.surfaceRadius(up) + 3.4 + feetAbove), v: scale(up, -vDown), q: fromBasis(east, north, up), w: [0, 0, 0] });
  s.prev = cloneState(s.state);
}

function runUntilOutcome(s, seconds = 10, cmd = {}) {
  for (let t = 0; t < seconds && !s.outcome; t += dt) s.step(dt, cmd);
  return s.result();
}

test('falling with the engine off speeds up and nothing ends', () => {
  const s = new FlightSession({ mission: getMission(1), difficulty: 'easy' });
  const up = normalize(s.state.r);
  const v0 = dot(s.state.v, up);
  for (let i = 0; i < 120; i++) s.step(dt, {});
  assert.ok(dot(s.state.v, up) < v0 - 1.5);
  assert.equal(s.outcome, null);
  assert.equal(s.sas, true);
});

test('snapshot interpolates between the last two physics states', () => {
  const s = new FlightSession({ mission: getMission(1), difficulty: 'easy' });
  s.step(dt, {});
  const mid = s.snapshot(0.5).r;
  const half = length(sub(s.state.r, s.prev.r)) / 2;
  assert.ok(Math.abs(length(sub(mid, s.prev.r)) - half) < 1e-6);
});

test('a gentle touchdown on the mission 2 pad lands, scores and wins gold', () => {
  const s = new FlightSession({ mission: getMission(2), difficulty: 'easy' });
  placeOverPad(s, 0.2, 0.5);
  const r = runUntilOutcome(s);
  assert.equal(r.outcome, 'landed');
  assert.equal(r.grade, 'perfect');
  assert.equal(r.medal, 'gold');
  assert.ok(r.score.total > 2000);
});

test('slamming into the pad crashes with zero score and stops the simulation', () => {
  const s = new FlightSession({ mission: getMission(2), difficulty: 'hard' });
  placeOverPad(s, 2, 8);
  const r = runUntilOutcome(s);
  assert.equal(r.outcome, 'crashed');
  assert.equal(r.score.total, 0);
  const t = s.state.time;
  s.step(dt, {});
  assert.equal(s.state.time, t);
});

test('aids are only available on easy', () => {
  assert.equal(new FlightSession({ mission: getMission(1), difficulty: 'easy' }).aidsAvailable, true);
  assert.equal(new FlightSession({ mission: getMission(1), difficulty: 'hard' }).aidsAvailable, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/game/session.js'`.

- [ ] **Step 3: Implement `src/game/session.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Implement `src/flight.js`**

```js
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
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Munlendr</title>
  <link rel="stylesheet" href="styles.css">
  <script type="importmap">{ "imports": { "three": "./vendor/three/three.module.js" } }</script>
</head>
<body>
  <canvas id="view"></canvas>
  <div id="hud" class="hidden"></div>
  <div id="screens"></div>
  <noscript>Munlendr needs JavaScript.</noscript>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 7: Create the temporary quick-start `src/main.js`**

```js
import { SceneRenderer } from './render/scene.js';
import { Input } from './game/input.js';
import { Flight } from './flight.js';
import { getMission } from './game/missions.js';
import { defaultData } from './game/storage.js';

const sr = new SceneRenderer(document.getElementById('view'));
const input = new Input(window);
input.attach();
const screens = document.getElementById('screens');
const params = new URLSearchParams(location.search);
const mission = getMission(Number(params.get('mission') ?? 1));
const difficulty = params.get('difficulty') === 'hard' ? 'hard' : 'easy';
let flight = null;

async function begin() {
  flight?.dispose();
  screens.onclick = null;
  screens.textContent = 'Loading terrain…';
  flight = new Flight({
    sceneRenderer: sr, input, mission, difficulty, settings: defaultData().settings,
    onEnd: (r) => {
      screens.textContent = `${r.outcome.toUpperCase()} (${r.grade}${r.reason ? `, ${r.reason}` : ''}) — score ${r.score.total}. Click to retry.`;
      screens.onclick = begin;
    },
    onPauseRequest: () => {},
  });
  await flight.load((pending) => { screens.textContent = `Loading terrain… ${pending}`; });
  screens.textContent = '';
  flight.start();
}

begin().catch((e) => { screens.textContent = `Error: ${e.message}`; });
```

- [ ] **Step 8: Append to `styles.css`** (placeholder message styling; Task 19 replaces the `#screens` rules)

```css
#screens:not(:empty) {
  position: fixed; left: 0; right: 0; top: 40%; z-index: 20;
  text-align: center; font-size: 22px; font-weight: 800;
  text-shadow: 0 2px 0 var(--ink);
}
```

- [ ] **Step 9: Syntax-check, run tests and play**

Run:
```bash
node --check src/flight.js && node --check src/main.js && npm test
```
Expected: no syntax errors, all tests PASS.

Then `npm run serve` and open `http://localhost:8080/`. Play mission 1:
- After "Loading terrain…" the chase camera shows the lander falling and drifting east over the moon.
- Hold Shift (or R): after about 0.5 s the plume appears and grows slowly (lag). X cuts it, Z goes full.
- W/S/A/D tilt the lander relative to the camera; I/J/K/L slide it without tilting; RCS puffs show on the right pods.
- C cycles chase → orbit → top-down → surface; dragging orbits and the wheel zooms each view separately.
- Land gently with the engine cut: after ~3 s the message reads `LANDED (safe|perfect…) — score …`. Hit the ground hard: the lander bursts into debris and the message reads `CRASHED`.
- `?mission=2&difficulty=hard` starts mission 2.
No console errors.

- [ ] **Step 10: Commit**

```bash
git add src/game/session.js tests/session.test.js src/flight.js index.html src/main.js styles.css
git commit -m "feat: flight session and a playable end-to-end flight"
```

---

### Task 18: HUD

**Files:**
- Create: `src/game/telemetry.js`, `src/hud/format.js`, `src/hud/attitude-ball.js`, `src/hud/nav-map.js`, `src/hud/vehicle-view.js`, `src/hud/hud.js`
- Modify: `src/flight.js` (feed the HUD), `src/main.js` (create the HUD), `styles.css` (append HUD styles)
- Test: `tests/telemetry.test.js`, `tests/format.test.js`

**Interfaces:**
- Consumes: Tasks 3, 4, 7, 16, 17.
- Produces:
  - `telemetry.js`: `computeTelemetry({ state, world, difficulty, fuelCapacity, rcsCapacity, throttleCmd, cfg? }) → t` with `altitude, agl, vs, hs, speed, hDir, vEast, vNorth, timeToImpact, tilt, tiltDir, axisLocal, velLocal, rate, throttleCmd, throttle, engineOn, igniting, fuel, fuelPct, rcs, rcsPct, dv, twr, mass, x, y, targetDistance, targetBearing, zcm, lTop, lBot, thrusters` (angles in degrees, bearings 0 = north, `null` when undefined); `statusMessages({ t, judge, outcome }) → [{ text, level: 'good'|'warn'|'bad' }]`.
  - `format.js`: `vsLevel(vs)`, `fmt(n, digits)`, `fmtSigned(n, digits)`, `fmtDistance(m)`, `fmtClock(s)`, `fmtBearing(deg)`, `compass(deg)`, `burnLevel(agl, burn)`, `escapeHtml(s)`, `hiDpiContext(canvas, w, h)`.
  - `hud.js`: `class Hud(root) { show(on), setScale(s), update(t, info) }` where `info = { missionName, time, sas, aids, aidsAvailable, controlFrame, cameraName, messages, burnNow, vehicleView, visible, difficulty }`.

- [ ] **Step 1: Write the failing tests**

`tests/format.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vsLevel, fmt, fmtSigned, fmtDistance, fmtClock, fmtBearing, compass, burnLevel, escapeHtml } from '../src/hud/format.js';

test('vertical speed colours: green < 2, yellow < 5, else red (either sign)', () => {
  assert.equal(vsLevel(-1.99), 'good');
  assert.equal(vsLevel(-2), 'warn');
  assert.equal(vsLevel(4.99), 'warn');
  assert.equal(vsLevel(-5), 'bad');
});

test('number formatting', () => {
  assert.equal(fmt(3.14159, 2), '3.14');
  assert.equal(fmt(NaN), '—');
  assert.equal(fmtSigned(2.25, 1), '+2.3');
  assert.equal(fmtSigned(-0.01, 1), '0.0');
  assert.equal(fmtDistance(9999), '9999 m');
  assert.equal(fmtDistance(12345), '12.3 km');
  assert.equal(fmtClock(75.9), '01:15');
  assert.equal(fmtBearing(5), '005°');
  assert.equal(fmtBearing(null), '—');
  assert.equal(compass(90), 'E');
  assert.equal(compass(350), 'N');
});

test('burn-now urgency', () => {
  assert.equal(burnLevel(500, 100), 'good');
  assert.equal(burnLevel(150, 100), 'warn');
  assert.equal(burnLevel(105, 100), 'bad');
  assert.equal(burnLevel(100, Infinity), 'bad');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
});
```

`tests/telemetry.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTelemetry, statusMessages } from '../src/game/telemetry.js';
import { createBody } from '../src/sim/body.js';
import { createRocketState } from '../src/sim/rocket.js';
import { latLonToDir, tangentBasis, offsetDirection } from '../src/sim/frame.js';
import { fromBasis } from '../src/math/quat.js';
import { scale } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const R = CONFIG.moon.radius;
const body = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const site = latLonToDir(8, 23);
const world = { body, siteDir: site };
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

function stateAt(dir, agl, vUp) {
  const { east, north } = tangentBasis(dir);
  return createRocketState({ position: scale(dir, R + agl), velocity: scale(dir, vUp), orientation: fromBasis(east, north, dir), fuel: 700 });
}
const tele = (state) => computeTelemetry({ state, world, difficulty: 'easy', fuelCapacity: 700, rcsCapacity: 60, throttleCmd: 0 });

test('straight above the target, falling 5 m/s', () => {
  const t = tele(stateAt(site, 100, -5));
  close(t.agl, 100, 1e-6);
  close(t.vs, -5, 1e-9);
  close(t.timeToImpact, 20, 1e-6);
  close(t.tilt, 0, 1e-6);
  close(t.targetDistance, 0, 1e-6);
  assert.equal(t.targetBearing, null);
  close(t.fuelPct, 1, 1e-12);
  close(t.twr, 12000 / (2760 * 1.62), 0.01);
});

test('100 m east of the target: offset +x and bearing west', () => {
  const t = tele(stateAt(offsetDirection(site, 100, 0, R), 50, 0));
  close(t.x, 100, 0.01);
  close(t.y, 0, 0.01);
  close(t.targetBearing, 270, 0.1);
  assert.equal(t.timeToImpact, null);
});

const judge = (status, settle = 0) => ({ status, settle, cfg: CONFIG.landing });

test('touchdown with the engine running tells the player to cut it', () => {
  const t = { ...tele(stateAt(site, 3.4, 0)), engineOn: true };
  assert.deepEqual(statusMessages({ t, judge: judge('touchdown'), outcome: null })[0], { text: 'CONTACT — CUT ENGINE', level: 'warn' });
});

test('settling counts down; low fuel and outcomes are reported', () => {
  const t = tele(stateAt(site, 3.4, 0));
  assert.equal(statusMessages({ t, judge: judge('touchdown', 1.2), outcome: null })[0].text, 'HOLD 2');
  const low = { ...t, fuel: 30, fuelPct: 30 / 700 };
  assert.ok(statusMessages({ t: low, judge: judge('flying'), outcome: null }).some((m) => m.text === 'LOW FUEL'));
  assert.deepEqual(statusMessages({ t, judge: judge('landed'), outcome: 'landed' }), [{ text: 'LANDED', level: 'good' }]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../src/hud/format.js'` and `'.../src/game/telemetry.js'`.

- [ ] **Step 3: Implement `src/hud/format.js`**

```js
export function vsLevel(vs) {
  const a = Math.abs(vs);
  return a < 2 ? 'good' : a < 5 ? 'warn' : 'bad';
}

export const fmt = (n, digits = 0) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

export function fmtSigned(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  const v = Math.abs(n) < 0.5 * 10 ** -digits ? 0 : n;
  return v > 0 ? `+${v.toFixed(digits)}` : v.toFixed(digits);
}

export function fmtDistance(m) {
  if (!Number.isFinite(m)) return '—';
  return Math.abs(m) < 10000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function fmtClock(s) {
  const t = Math.max(0, Math.floor(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export const fmtBearing = (deg) => (deg == null ? '—' : `${String(Math.round(deg) % 360).padStart(3, '0')}°`);

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg) => (deg == null ? '' : POINTS[Math.round(deg / 45) % 8]);

export function burnLevel(agl, burn) {
  if (!Number.isFinite(burn)) return 'bad';
  if (burn <= 0) return 'good';
  return agl <= burn * 1.1 ? 'bad' : agl <= burn * 1.6 ? 'warn' : 'good';
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

export function hiDpiContext(canvas, w, h) {
  const r = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(w * r);
  canvas.height = Math.round(h * r);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(r, r);
  return ctx;
}
```

- [ ] **Step 4: Implement `src/game/telemetry.js`**

```js
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Implement `src/hud/attitude-ball.js`**

```js
import { hiDpiContext } from './format.js';

const SIZE = 120;
const EDGE_DEG = 30; // degrees from vertical at the rim of the ball
const COLORS = { ball: '#2a2352', ring3: '#4be3ac', ring10: '#ffd166', cross: 'rgba(255,255,255,0.18)', axisGood: '#4be3ac', axisWarn: '#ffd166', axisBad: '#ff6f91', retro: '#ffd166', pro: '#9ad0ff', text: '#b9b0d6' };

export class AttitudeBall {
  constructor(canvas) {
    this.ctx = hiDpiContext(canvas, SIZE, SIZE);
  }

  draw(t, { showVelocity }) {
    const ctx = this.ctx, c = SIZE / 2, R = SIZE * 0.44;
    const toXY = (angleDeg, bearing) => {
      const r = Math.min(R, (angleDeg / EDGE_DEG) * R), b = (bearing * Math.PI) / 180;
      return [c + Math.sin(b) * r, c - Math.cos(b) * r];
    };
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.ball;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5;
    for (const [deg, col] of [[10, COLORS.ring10], [3, COLORS.ring3]]) {
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(c, c, (deg / EDGE_DEG) * R, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.cross;
    ctx.beginPath(); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, c - R + 10);

    if (showVelocity && t.speed > 0.2) {
      const [ve, vn, vu] = t.velLocal;
      const sp = Math.hypot(ve, vn, vu);
      const retroAngle = (Math.acos(Math.max(-1, Math.min(1, -vu / sp))) * 180) / Math.PI;
      const [rx, ry] = toXY(retroAngle, (Math.atan2(-ve, -vn) * 180) / Math.PI);
      ctx.strokeStyle = COLORS.retro; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.moveTo(rx - 4, ry - 4); ctx.lineTo(rx + 4, ry + 4); ctx.moveTo(rx + 4, ry - 4); ctx.lineTo(rx - 4, ry + 4); ctx.stroke();
      const proAngle = 180 - retroAngle;
      if (proAngle < EDGE_DEG) {
        const [px, py] = toXY(proAngle, (Math.atan2(ve, vn) * 180) / Math.PI);
        ctx.strokeStyle = COLORS.pro;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = COLORS.pro; ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }

    const [ax, ay] = toXY(t.tilt, t.tiltDir ?? 0);
    const col = t.tilt < 3 ? COLORS.axisGood : t.tilt < 10 ? COLORS.axisWarn : COLORS.axisBad;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
  }
}
```

- [ ] **Step 7: Implement `src/hud/nav-map.js`**

```js
import { hiDpiContext } from './format.js';

const SIZE = 120;
const RANGES = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

export class NavMap {
  constructor(canvas) {
    this.ctx = hiDpiContext(canvas, SIZE, SIZE);
  }

  draw(t) {
    const ctx = this.ctx, c = SIZE / 2, R = SIZE * 0.45;
    const range = RANGES.find((r) => r >= Math.max(40, t.targetDistance * 1.25)) ?? RANGES[RANGES.length - 1];
    const k = R / range;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#2a2352';
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(c, c, R / 2, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = '#4be3ac'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c, c, 5, 0, Math.PI * 2); ctx.moveTo(c - 9, c); ctx.lineTo(c + 9, c); ctx.moveTo(c, c - 9); ctx.lineTo(c, c + 9); ctx.stroke();

    let x = t.x * k, y = -t.y * k;
    const d = Math.hypot(x, y);
    if (d > R) { x *= R / d; y *= R / d; }
    const vx = t.vEast * 10 * k, vy = -t.vNorth * 10 * k; // 10 s ahead
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c + x, c + y); ctx.lineTo(c + x + Math.max(-R, Math.min(R, vx)), c + y + Math.max(-R, Math.min(R, vy))); ctx.stroke();
    ctx.fillStyle = '#ff6f59';
    ctx.beginPath(); ctx.arc(c + x, c + y, 4.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#b9b0d6';
    ctx.font = '700 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(range >= 1000 ? `${range / 1000} km` : `${range} m`, 4, SIZE - 4);
    ctx.textAlign = 'center';
    ctx.fillText('N', c, c - R + 10);
  }
}
```

- [ ] **Step 8: Implement `src/hud/vehicle-view.js`**

```js
import { hiDpiContext } from './format.js';
import { THRUSTERS } from '../sim/actuators.js';

const W = 110, H = 180;
const PX = 26;              // pixels per metre (vertical)
const CY = H / 2;
const toY = (z) => CY - z * PX;
const HALF_W = 22;

export class VehicleView {
  constructor(canvas) {
    this.ctx = hiDpiContext(canvas, W, H);
  }

  draw(t, difficulty) {
    const ctx = this.ctx, cx = W / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f4efff';
    ctx.strokeRect(cx - HALF_W, toY(3), HALF_W * 2, 6 * PX);

    const tank = (z0, z1, pct, color) => {
      const top = toY(z1), bottom = toY(z0), h = bottom - top;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(cx - HALF_W + 5, top, HALF_W * 2 - 10, h);
      ctx.fillStyle = color;
      const fh = h * Math.max(0, Math.min(1, pct));
      ctx.fillRect(cx - HALF_W + 6, bottom - fh, HALF_W * 2 - 12, fh);
    };
    tank(-2.6, -0.4, t.fuelPct, '#f2c14e');
    tank(0.6, 1.4, t.rcsPct, '#9ad0ff');

    THRUSTERS.forEach((th, i) => {
      const o = t.thrusters[i];
      if (o < 0.05) return;
      const y = toY(th.ring === 'top' ? 3 : -3) + (th.ring === 'top' ? 6 : -6);
      ctx.fillStyle = ctx.strokeStyle = `rgba(232,243,255,${0.4 + 0.6 * o})`;
      if (th.axis === 0) {
        const side = -th.sign; // the jet leaves from the opposite side of the push
        const x0 = cx + side * HALF_W;
        ctx.beginPath(); ctx.moveTo(x0, y - 5); ctx.lineTo(x0 + side * 14, y); ctx.lineTo(x0, y + 5); ctx.closePath(); ctx.fill();
      } else {
        const x0 = cx + (th.sign > 0 ? -8 : 8);
        ctx.beginPath(); ctx.arc(x0, y, 4, 0, Math.PI * 2); ctx.stroke();
        if (th.sign > 0) { ctx.beginPath(); ctx.arc(x0, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(x0 - 3, y - 3); ctx.lineTo(x0 + 3, y + 3); ctx.moveTo(x0 + 3, y - 3); ctx.lineTo(x0 - 3, y + 3); ctx.stroke(); }
      }
    });

    const yc = toY(t.zcm);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(cx + HALF_W + 4, toY(3)); ctx.lineTo(cx + HALF_W + 4, toY(-3)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff6f59';
    ctx.beginPath(); ctx.arc(cx, yc, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e1838';
    ctx.beginPath(); ctx.moveTo(cx, yc); ctx.arc(cx, yc, 6, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, yc); ctx.arc(cx, yc, 6, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#b9b0d6';
    ctx.font = '700 9px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${t.lTop.toFixed(2)}`, cx + HALF_W + 7, (toY(3) + yc) / 2 + 3);
    ctx.fillText(`${t.lBot.toFixed(2)}`, cx + HALF_W + 7, (toY(-3) + yc) / 2 + 3);
    ctx.textAlign = 'center';
    ctx.fillText(difficulty === 'hard' ? 'CoM moves' : 'CoM fixed', cx, H - 2);
  }
}
```

- [ ] **Step 9: Implement `src/hud/hud.js`**

```js
import { AttitudeBall } from './attitude-ball.js';
import { NavMap } from './nav-map.js';
import { VehicleView } from './vehicle-view.js';
import { fmt, fmtSigned, fmtDistance, fmtClock, fmtBearing, compass, vsLevel, burnLevel, escapeHtml } from './format.js';

const TEMPLATE = `
<div class="panel hud-status">
  <span class="hud-mission" data-k="mission"></span>
  <span class="hud-clock" data-k="clock"></span>
  <span class="chip" data-k="chipSas">SAS</span>
  <span class="chip" data-k="chipAids">AIDS</span>
  <span class="chip" data-k="chipFrame">CAM</span>
  <span class="chip" data-k="chipCam">CHASE</span>
  <div class="hud-messages" data-k="messages"></div>
</div>
<div class="panel hud-height">
  <h3>Height</h3>
  <div class="row big"><label>AGL</label><b data-k="agl"></b></div>
  <div class="row"><label>Altitude</label><b data-k="alt"></b></div>
  <div class="row"><label>Impact in</label><b data-k="tti"></b></div>
  <div class="row" data-k="burnRow"><label>Burn at</label><b data-k="burn"></b></div>
</div>
<div class="panel hud-velocity">
  <h3>Velocity</h3>
  <div class="row big"><label>Vertical</label><b data-k="vs"></b></div>
  <div class="row"><label>Horizontal <i class="arrow" data-k="hArrow">➤</i></label><b data-k="hs"></b></div>
  <div class="row"><label>Total</label><b data-k="speed"></b></div>
</div>
<div class="panel hud-nav">
  <h3>Navigation</h3>
  <canvas data-k="map"></canvas>
  <div class="row"><label>Target</label><b data-k="dist"></b></div>
  <div class="row"><label>Bearing</label><b data-k="bearing"></b></div>
  <div class="row"><label>E, N</label><b data-k="xy"></b></div>
</div>
<div class="panel hud-attitude">
  <h3>Attitude</h3>
  <canvas data-k="ball"></canvas>
  <div class="row"><label>Tilt</label><b data-k="tilt"></b></div>
  <div class="row"><label>Rate</label><b data-k="rate"></b></div>
</div>
<div class="panel hud-propulsion">
  <div class="throttle">
    <div class="bar"><div class="fill cmd" data-k="barCmd"></div><span>CMD</span></div>
    <div class="bar"><div class="fill act" data-k="barAct"></div><span>ACT</span></div>
    <div class="ign" data-k="ign">IGN</div>
  </div>
  <div class="grid">
    <h3>Propulsion</h3>
    <div class="row"><label>Throttle cmd / act</label><b data-k="thr"></b></div>
    <div class="row"><label>Fuel</label><b data-k="fuel"></b></div>
    <div class="row"><label>RCS</label><b data-k="rcs"></b></div>
    <div class="row"><label>Δv left</label><b data-k="dv"></b></div>
    <div class="row"><label>TWR</label><b data-k="twr"></b></div>
  </div>
</div>
<div class="panel hud-vehicle" data-k="vehicle">
  <h3>Vehicle</h3>
  <canvas data-k="veh"></canvas>
</div>`;

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = TEMPLATE;
    this.el = {};
    root.querySelectorAll('[data-k]').forEach((e) => { this.el[e.dataset.k] = e; });
    this.ball = new AttitudeBall(this.el.ball);
    this.map = new NavMap(this.el.map);
    this.vehicle = new VehicleView(this.el.veh);
    this.text = {};
    this.msgKey = '';
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  setScale(s) {
    this.root.style.setProperty('--hud-scale', String(s));
  }

  set(k, v) {
    if (this.text[k] !== v) {
      this.text[k] = v;
      this.el[k].textContent = v;
    }
  }

  level(k, lvl) {
    const c = this.el[k].classList;
    c.toggle('good', lvl === 'good');
    c.toggle('warn', lvl === 'warn');
    c.toggle('bad', lvl === 'bad');
  }

  update(t, s) {
    this.root.classList.toggle('collapsed', !s.visible);
    this.set('mission', s.missionName);
    this.set('clock', fmtClock(s.time));
    this.el.chipSas.classList.toggle('on', s.sas);
    this.set('chipAids', s.aidsAvailable ? 'AIDS' : 'NO AIDS');
    this.el.chipAids.classList.toggle('on', s.aids && s.aidsAvailable);
    this.set('chipFrame', s.controlFrame === 'body' ? 'BODY' : 'CAM');
    this.set('chipCam', s.cameraName.toUpperCase());
    const key = s.messages.map((m) => `${m.level}:${m.text}`).join('|');
    if (key !== this.msgKey) {
      this.msgKey = key;
      this.el.messages.innerHTML = s.messages.map((m) => `<span class="msg ${m.level}">${escapeHtml(m.text)}</span>`).join('');
    }

    this.set('agl', `${fmt(t.agl, t.agl < 100 ? 1 : 0)} m`);
    this.set('alt', `${fmt(t.altitude / 1000, 2)} km`);
    this.set('tti', t.timeToImpact == null ? '—' : `${fmt(t.timeToImpact, 1)} s`);
    const showBurn = s.aids && s.aidsAvailable && s.burnNow != null;
    this.el.burnRow.classList.toggle('hidden', !showBurn);
    if (showBurn) {
      this.set('burn', Number.isFinite(s.burnNow) ? `${fmt(s.burnNow)} m` : 'TOO LATE');
      this.level('burn', burnLevel(t.agl, s.burnNow));
    }

    this.set('vs', `${fmtSigned(t.vs, 1)} m/s`);
    this.level('vs', vsLevel(t.vs));
    this.set('hs', `${fmt(t.hs, 1)} m/s ${compass(t.hDir)}`);
    this.level('hs', t.hs < 0.5 ? 'good' : t.hs < 1.5 ? 'warn' : 'bad');
    this.el.hArrow.style.visibility = t.hDir == null ? 'hidden' : 'visible';
    this.el.hArrow.style.transform = `rotate(${(t.hDir ?? 0) - 90}deg)`;
    this.set('speed', `${fmt(t.speed, 1)} m/s`);

    this.set('tilt', `${fmt(t.tilt, 1)}° ${compass(t.tiltDir)}`);
    this.level('tilt', t.tilt < 3 ? 'good' : t.tilt < 10 ? 'warn' : 'bad');
    this.set('rate', `${fmt(t.rate, 1)} °/s`);
    this.level('rate', t.rate < 2 ? 'good' : t.rate < 5 ? 'warn' : 'bad');

    this.el.barCmd.style.height = `${Math.round(t.throttleCmd * 100)}%`;
    this.el.barAct.style.height = `${Math.round(t.throttle * 100)}%`;
    this.el.ign.classList.toggle('on', t.igniting);
    this.set('thr', `${fmt(t.throttleCmd * 100)} / ${fmt(t.throttle * 100)} %`);
    this.set('fuel', `${fmt(t.fuel)} kg · ${fmt(t.fuelPct * 100)}%`);
    this.level('fuel', t.fuelPct > 0.25 ? 'good' : t.fuelPct > 0.1 ? 'warn' : 'bad');
    this.set('rcs', `${fmt(t.rcs, 1)} kg`);
    this.level('rcs', t.rcsPct > 0.3 ? 'good' : t.rcsPct > 0.15 ? 'warn' : 'bad');
    this.set('dv', `${fmt(t.dv)} m/s`);
    this.set('twr', fmt(t.twr, 2));

    this.set('dist', fmtDistance(t.targetDistance));
    this.set('bearing', fmtBearing(t.targetBearing));
    this.set('xy', `${fmt(t.x)}, ${fmt(t.y)} m`);

    this.ball.draw(t, { showVelocity: s.aids && s.aidsAvailable });
    this.map.draw(t);
    this.el.vehicle.classList.toggle('hidden', !s.vehicleView);
    if (s.vehicleView) this.vehicle.draw(t, s.difficulty);
  }
}
```

- [ ] **Step 10: Feed the HUD from `src/flight.js`**

Add imports at the top of `src/flight.js`:
```js
import { computeTelemetry, statusMessages } from './game/telemetry.js';
import { VIEW_LABELS } from './render/cameras.js';
```
In `draw()`, insert this block immediately before `this.sr.render();`:
```js
    if (this.hud) {
      const t = computeTelemetry({
        state: snap, world: this.world, difficulty: this.difficulty,
        fuelCapacity: this.mission.fuel, rcsCapacity: this.mission.rcs, throttleCmd: this.input.throttle,
      });
      this.hud.update(t, {
        missionName: `M${this.mission.id} · ${this.mission.name}`,
        time: snap.time,
        sas: s.sas,
        aids: this.ui.aids,
        aidsAvailable: s.aidsAvailable,
        controlFrame: this.controlFrameMode,
        cameraName: VIEW_LABELS[this.rig.active],
        messages: statusMessages({ t, judge: s.judge, outcome: s.outcome?.outcome ?? null }),
        burnNow: this.predictions?.burnNow ?? null,
        vehicleView: this.ui.vehicleView,
        visible: this.ui.hudVisible,
        difficulty: this.difficulty,
      });
    }
```

- [ ] **Step 11: Create the HUD in `src/main.js`**

Add after the existing imports:
```js
import { Hud } from './hud/hud.js';
```
Add after `const screens = document.getElementById('screens');`:
```js
const hud = new Hud(document.getElementById('hud'));
```
In the `new Flight({ ... })` options add `hud,` after `settings: defaultData().settings,`, and replace `flight.start();` with:
```js
  hud.show(true);
  flight.start();
```

- [ ] **Step 12: Append HUD styles to `styles.css`**

```css
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
#hud .panel {
  position: absolute;
  background: var(--panel);
  border: 2px solid var(--panel-edge);
  border-radius: 18px;
  padding: 10px 14px;
  backdrop-filter: blur(6px);
  box-shadow: 0 5px 0 rgba(10, 6, 30, 0.35);
  scale: var(--hud-scale);
}
#hud h3 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
#hud .row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; font-size: 13px; }
#hud .row label { color: var(--muted); }
#hud .row b { font-family: var(--mono); font-weight: 700; font-size: 15px; white-space: nowrap; }
#hud .row.big b { font-size: 24px; }
#hud canvas { display: block; margin: 0 auto 6px; }
.good { color: var(--good); }
.warn { color: var(--warn); }
.bad { color: var(--bad); }
.hud-status { top: 12px; left: 50%; translate: -50% 0; transform-origin: top center; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; max-width: 52vw; }
.hud-height { top: 12px; left: 12px; width: 220px; transform-origin: top left; }
.hud-velocity { top: 168px; left: 12px; width: 220px; transform-origin: top left; }
.hud-nav { top: 12px; right: 12px; width: 190px; transform-origin: top right; }
.hud-attitude { top: 252px; right: 12px; width: 190px; transform-origin: top right; }
.hud-propulsion { bottom: 12px; left: 50%; translate: -50% 0; transform-origin: bottom center; width: 420px; display: flex; gap: 14px; }
.hud-vehicle { bottom: 12px; right: 12px; transform-origin: bottom right; }
.hud-mission { font-weight: 800; }
.hud-clock { font-family: var(--mono); color: var(--muted); }
.chip { font: 700 11px var(--mono); padding: 3px 8px; border-radius: 999px; border: 1px solid var(--panel-edge); color: var(--muted); }
.chip.on { background: var(--good); color: var(--ink); border-color: transparent; }
.hud-messages { flex-basis: 100%; display: flex; gap: 8px; justify-content: center; }
.hud-messages:empty { display: none; }
.msg { font-weight: 800; padding: 4px 12px; border-radius: 999px; background: rgba(0, 0, 0, 0.35); }
.arrow { display: inline-block; font-style: normal; color: var(--text); }
.hud-propulsion .throttle { display: flex; gap: 8px; align-items: flex-end; }
.hud-propulsion .bar { position: relative; width: 26px; height: 110px; border-radius: 10px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.hud-propulsion .fill { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 10px; }
.hud-propulsion .fill.cmd { background: rgba(154, 208, 255, 0.55); }
.hud-propulsion .fill.act { background: var(--accent); }
.hud-propulsion .bar span { position: absolute; top: 4px; left: 0; right: 0; text-align: center; font-size: 9px; color: var(--muted); }
.hud-propulsion .ign { font: 700 11px var(--mono); color: var(--muted); padding: 3px 6px; border-radius: 8px; border: 1px solid var(--panel-edge); }
.hud-propulsion .ign.on { color: var(--ink); background: var(--warn); }
.hud-propulsion .grid { flex: 1; display: grid; gap: 2px; align-content: start; }
#hud.collapsed .panel:not(.hud-status) { display: none; }
```

- [ ] **Step 13: Syntax-check, test, look**

Run:
```bash
for f in src/hud/*.js src/game/telemetry.js src/flight.js src/main.js; do node --check "$f" || exit 1; done
npm test
```
Expected: all PASS. Open `http://localhost:8080/` and check:
- Height (top left), Velocity (below it), Navigation with mini-map (top right), Attitude ball (right), Propulsion with CMD/ACT bars (bottom centre), Vehicle schematic (bottom right), status strip with chips (top centre).
- Vertical speed turns yellow then red as you fall faster; the CMD bar jumps when you press Z and the ACT bar follows slowly; IGN lights during ignition.
- Easy mode shows "Burn at … m" and a pink impact ring on the ground; G hides both; Hard mode shows "NO AIDS".
- `?difficulty=hard`: the CoM dot in the vehicle view climbs as fuel burns; easy keeps it still.
- Touch down with the engine on: "CONTACT — CUT ENGINE"; cut it: "HOLD 3 / 2 / 1"; then LANDED.
- V toggles the vehicle view, H hides everything but the status strip, T toggles the SAS chip, C updates the camera chip.

- [ ] **Step 14: Commit**

```bash
git add src/game/telemetry.js src/hud tests/telemetry.test.js tests/format.test.js src/flight.js src/main.js styles.css
git commit -m "feat: full flight HUD with attitude ball, nav map and vehicle schematic"
```

---

### Task 19: Screens, progression and saving

**Files:**
- Create: `src/ui/screens.js`
- Modify: `src/main.js` (replace the whole file), `styles.css` (remove the Task 17 `#screens:not(:empty)` rule and append screen styles), `index.html` (canvas starts hidden)

**Interfaces:**
- Consumes: everything above.
- Produces: `screens.js` exports `hideScreens(root)`, `renderTitle(root, { onPlay, onSettings })`, `renderSelect(root, { data, onPick(id), onBack })`, `renderBriefing(root, { mission, difficulty, onStart(difficulty), onBack })`, `renderLoading(root, text)`, `updateLoading(root, text)`, `renderError(root, { message, onBack })`, `renderPause(root, { onResume, onRestart, onSettings, onQuit })`, `renderResults(root, { mission, result, newBest, hasNext, onRetry, onNext, onMenu })`, `renderSettings(root, { settings, onChange(settings), onBack })`.

- [ ] **Step 1: Implement `src/ui/screens.js`**

```js
import { escapeHtml as h } from '../hud/format.js';
import { MISSIONS, isUnlocked } from '../game/missions.js';

const KEYS_HELP = [
  ['Shift / R', 'Throttle up'], ['Ctrl / F', 'Throttle down'], ['Z', 'Full throttle'], ['X', 'Cut engine'],
  ['W / S', 'Pitch toward / away'], ['A / D', 'Yaw left / right'], ['I J K L', 'Slide without tilting'],
  ['T', 'Stability assist'], ['C', 'Next camera'], ['Drag / wheel', 'Orbit / zoom camera'],
  ['G', 'Prediction aids (easy)'], ['V', 'Vehicle view'], ['H', 'Hide HUD'], ['Esc', 'Pause'],
];
const GRADE_LABEL = { perfect: 'Perfect', safe: 'Safe', crash: 'Crash' };
const CHECK_LABEL = { vs: 'Vertical speed', hs: 'Horizontal speed', tilt: 'Tilt', rate: 'Angular rate', slope: 'Ground slope' };
const CHECK_UNIT = { vs: 'm/s', hs: 'm/s', tilt: '°', rate: '°/s', slope: '°' };
const REASON = {
  vs: 'Hit the ground too fast.',
  hs: 'Touched down sliding sideways and tipped over.',
  tilt: 'Touched down too tilted.',
  rate: 'Still rotating at touchdown.',
  slope: 'The ground was too steep and the lander tipped over.',
  hull: 'The hull hit the ground.',
  tipped: 'Tipped over after touchdown.',
};

function mount(root, html) {
  root.innerHTML = `<div class="screen">${html}</div>`;
  root.classList.remove('hidden');
  return root.firstElementChild;
}
const on = (el, sel, fn) => el.querySelector(sel)?.addEventListener('click', fn);

export function hideScreens(root) {
  root.innerHTML = '';
  root.classList.add('hidden');
}

export function renderTitle(root, { onPlay, onSettings }) {
  const el = mount(root, `<div class="card title">
    <h1>Munlendr</h1><p class="sub">Plan with the engine. Correct with the thrusters.</p>
    <button class="primary" data-a="play">Play</button><button data-a="settings">Settings</button></div>`);
  on(el, '[data-a=play]', onPlay);
  on(el, '[data-a=settings]', onSettings);
  el.querySelector('[data-a=play]').focus();
}

const bestLine = (best) => (best ? `${best.score}${best.medal ? ` <span class="medal ${best.medal}">${best.medal}</span>` : ''}` : '<span class="muted">—</span>');

export function renderSelect(root, { data, onPick, onBack }) {
  const cards = MISSIONS.map((m) => {
    const unlocked = isUnlocked(m, data.unlocked);
    const best = data.best[String(m.id)] ?? {};
    return `<button class="mission${unlocked ? '' : ' locked'}" data-id="${m.id}"${unlocked ? '' : ' disabled'}>
      <span class="num">${m.id}</span>
      <span class="name">${h(m.name)}</span>
      <span class="tag">${h(unlocked ? m.tagline : 'Land safely on the previous mission to unlock.')}</span>
      <span class="bests"><span>Easy ${bestLine(best.easy)}</span><span>Hard ${bestLine(best.hard)}</span></span>
    </button>`;
  }).join('');
  const el = mount(root, `<div class="card wide"><h2>Missions</h2><div class="missions">${cards}</div>
    <div class="actions"><button data-a="back">Back</button></div></div>`);
  el.querySelectorAll('.mission:not(.locked)').forEach((b) => b.addEventListener('click', () => onPick(Number(b.dataset.id))));
  on(el, '[data-a=back]', onBack);
  el.querySelector('.mission:not(.locked)')?.focus();
}

export function renderBriefing(root, { mission, difficulty, onStart, onBack }) {
  const s = mission.start;
  const goal = mission.goal.type === 'pinpoint'
    ? `Land on the green pad: within ${mission.goal.medals.bronze} m for bronze, ${mission.goal.medals.silver} m for silver, ${mission.goal.medals.gold} m for gold.`
    : 'Land safely anywhere flat. Blue rings mark flat ground; the green pad is the easiest place.';
  const el = mount(root, `<div class="card wide briefing">
    <h2>Mission ${mission.id}: ${h(mission.name)}</h2>
    <p>${h(goal)}</p>
    <ul class="facts">
      <li>Start ${s.agl} m above the ground, ${s.vUp < 0 ? `falling ${Math.abs(s.vUp)} m/s` : 'not falling yet'}, moving ${Math.hypot(s.vEast, s.vNorth)} m/s sideways.</li>
      <li>Fuel ${mission.fuel} kg, RCS ${mission.rcs} kg. Stability assist starts ${mission.sasOn ? 'on' : 'off'}.</li>
    </ul>
    <div class="difficulty" role="radiogroup">
      <button data-d="easy" class="${difficulty === 'easy' ? 'sel' : ''}"><b>Easy</b><span>Fixed centre of mass · prediction aids</span></button>
      <button data-d="hard" class="${difficulty === 'hard' ? 'sel' : ''}"><b>Hard</b><span>Shifting centre of mass · no aids · score ×1.5</span></button>
    </div>
    <details><summary>Controls</summary><table class="keys">${KEYS_HELP.map(([k, d]) => `<tr><td><kbd>${h(k)}</kbd></td><td>${h(d)}</td></tr>`).join('')}</table></details>
    <div class="actions"><button data-a="back">Back</button><button class="primary" data-a="start">Launch</button></div></div>`);
  let chosen = difficulty;
  el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
    chosen = b.dataset.d;
    el.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('sel', x === b));
  }));
  on(el, '[data-a=start]', () => onStart(chosen));
  on(el, '[data-a=back]', onBack);
  el.querySelector('[data-a=start]').focus();
}

export function renderLoading(root, text) {
  mount(root, `<div class="card"><div class="spinner"></div><p data-k="text">${h(text)}</p></div>`);
}

export function updateLoading(root, text) {
  const p = root.querySelector('[data-k=text]');
  if (p) p.textContent = text;
}

export function renderError(root, { message, onBack }) {
  const el = mount(root, `<div class="card"><h2>Something went wrong</h2><p>${h(message)}</p><div class="actions"><button data-a="back">Back</button></div></div>`);
  on(el, '[data-a=back]', onBack);
}

export function renderPause(root, { onResume, onRestart, onSettings, onQuit }) {
  const el = mount(root, `<div class="card"><h2>Paused</h2>
    <button class="primary" data-a="resume">Resume (Esc)</button>
    <button data-a="restart">Restart mission</button>
    <button data-a="settings">Settings</button>
    <button data-a="quit">Quit to menu</button></div>`);
  on(el, '[data-a=resume]', onResume);
  on(el, '[data-a=restart]', onRestart);
  on(el, '[data-a=settings]', onSettings);
  on(el, '[data-a=quit]', onQuit);
  el.querySelector('[data-a=resume]').focus();
}

export function renderResults(root, { mission, result, newBest, hasNext, onRetry, onNext, onMenu }) {
  const landed = result.outcome === 'landed';
  const title = landed ? `Landed: ${GRADE_LABEL[result.grade]}` : 'Crashed';
  const reason = landed ? '' : `<p class="reason">${h(REASON[result.reason] ?? 'The lander was destroyed.')}</p>`;
  const checks = (result.checks ?? []).map((c) => `<tr class="${c.grade}"><td>${CHECK_LABEL[c.key]}</td><td>${c.value.toFixed(c.key === 'vs' || c.key === 'hs' ? 2 : 1)} ${CHECK_UNIT[c.key]}</td><td>${GRADE_LABEL[c.grade]}</td></tr>`).join('');
  const p = result.score.parts;
  const score = landed ? `<table class="score">
    <tr><td>Landing</td><td>${p.grade}</td></tr>
    <tr><td>Fuel left</td><td>${p.fuel}</td></tr>
    ${mission.goal.type === 'pinpoint' ? `<tr><td>Accuracy (${result.distance.toFixed(1)} m)</td><td>${p.distance}</td></tr>` : ''}
    <tr><td>Time bonus</td><td>${p.time}</td></tr>
    ${result.score.multiplier !== 1 ? `<tr><td>Hard mode</td><td>×${result.score.multiplier}</td></tr>` : ''}
    <tr class="total"><td>Total</td><td>${result.score.total}</td></tr></table>` : '';
  const medal = result.medal ? `<div class="medal big ${result.medal}">${result.medal}</div>` : '';
  const el = mount(root, `<div class="card wide results ${landed ? 'ok' : 'fail'}">
    <h2>${title}</h2>${reason}${medal}${newBest ? '<p class="newbest">New best score!</p>' : ''}
    ${checks ? `<table class="checks">${checks}</table>` : ''}${score}
    <div class="actions"><button data-a="menu">Menu</button><button data-a="retry">Retry</button>${hasNext ? '<button class="primary" data-a="next">Next mission</button>' : ''}</div></div>`);
  on(el, '[data-a=retry]', onRetry);
  on(el, '[data-a=next]', onNext);
  on(el, '[data-a=menu]', onMenu);
  el.querySelector(hasNext ? '[data-a=next]' : '[data-a=retry]').focus();
}

export function renderSettings(root, { settings, onChange, onBack }) {
  const el = mount(root, `<div class="card"><h2>Settings</h2>
    <label class="field"><span>Thruster keys relative to</span>
      <select data-s="controlFrame"><option value="camera">Camera (recommended)</option><option value="body">Rocket body</option></select></label>
    <label class="field check"><input type="checkbox" data-s="invertDrag"><span>Invert camera drag</span></label>
    <label class="field"><span>HUD size</span><input type="range" min="0.7" max="1.3" step="0.05" data-s="hudScale"></label>
    <div class="actions"><button data-a="back">Back</button></div></div>`);
  const cf = el.querySelector('[data-s=controlFrame]');
  const inv = el.querySelector('[data-s=invertDrag]');
  const sc = el.querySelector('[data-s=hudScale]');
  cf.value = settings.controlFrame;
  inv.checked = settings.invertDrag;
  sc.value = String(settings.hudScale);
  const emit = () => onChange({ controlFrame: cf.value, invertDrag: inv.checked, hudScale: Number(sc.value) });
  cf.addEventListener('change', emit);
  inv.addEventListener('change', emit);
  sc.addEventListener('input', emit);
  on(el, '[data-a=back]', onBack);
}
```

- [ ] **Step 2: Replace `src/main.js`**

```js
import { SceneRenderer } from './render/scene.js';
import { Input } from './game/input.js';
import { Flight } from './flight.js';
import { Hud } from './hud/hud.js';
import { MISSIONS, unlocksAfter } from './game/missions.js';
import { createStorage, recordAttempt, isNewBest } from './game/storage.js';
import * as UI from './ui/screens.js';

const canvas = document.getElementById('view');
const screens = document.getElementById('screens');
const hud = new Hud(document.getElementById('hud'));
const storage = createStorage();
let data = storage.load();
hud.setScale(data.settings.hudScale);

const input = new Input(window);
input.attach();

let sr = null;
let rendererError = null;
try {
  sr = new SceneRenderer(canvas);
} catch (e) {
  rendererError = `This browser could not start WebGL (${e.message}).`;
}

let flight = null;
let current = null; // { mission, difficulty }
let state = 'menu'; // menu | loading | flying | paused | results

const save = () => storage.save(data);

function stopFlight() {
  flight?.dispose();
  flight = null;
  hud.show(false);
  canvas.classList.add('hidden');
}

function showTitle() {
  stopFlight();
  state = 'menu';
  if (rendererError) return UI.renderError(screens, { message: rendererError, onBack: () => location.reload() });
  UI.renderTitle(screens, { onPlay: showSelect, onSettings: () => showSettings(showTitle) });
}

function showSelect() {
  UI.renderSelect(screens, { data, onPick: (id) => showBriefing(MISSIONS.find((m) => m.id === id)), onBack: showTitle });
}

function showBriefing(mission, difficulty = current?.difficulty ?? 'easy') {
  UI.renderBriefing(screens, { mission, difficulty, onStart: (d) => startFlight(mission, d), onBack: showSelect });
}

function showSettings(back) {
  UI.renderSettings(screens, {
    settings: data.settings,
    onChange: (settings) => {
      data = { ...data, settings };
      save();
      hud.setScale(settings.hudScale);
      flight?.applySettings(settings);
    },
    onBack: back,
  });
}

async function startFlight(mission, difficulty) {
  stopFlight();
  current = { mission, difficulty };
  state = 'loading';
  UI.renderLoading(screens, 'Loading terrain…');
  const f = new Flight({ sceneRenderer: sr, input, mission, difficulty, settings: data.settings, hud, onEnd: endFlight, onPauseRequest: pauseFlight });
  flight = f;
  try {
    await f.load((pending) => UI.updateLoading(screens, pending > 0 ? `Loading terrain… ${pending} tiles to go` : 'Almost there…'));
  } catch (e) {
    if (flight !== f) return; // the player left while loading
    stopFlight();
    state = 'menu';
    UI.renderError(screens, { message: e.message, onBack: showTitle });
    return;
  }
  if (flight !== f) return;
  UI.hideScreens(screens);
  canvas.classList.remove('hidden');
  sr.resize();
  hud.show(true);
  state = 'flying';
  f.start();
}

function showPauseMenu() {
  UI.renderPause(screens, {
    onResume: resumeFlight,
    onRestart: () => startFlight(current.mission, current.difficulty),
    onSettings: () => showSettings(showPauseMenu),
    onQuit: showTitle,
  });
}

function pauseFlight() {
  if (!flight || state !== 'flying') return;
  flight.pause();
  state = 'paused';
  showPauseMenu();
}

function resumeFlight() {
  if (!flight || state !== 'paused') return;
  UI.hideScreens(screens);
  state = 'flying';
  flight.resume();
}

function endFlight(result) {
  const { mission, difficulty } = current;
  const attempt = {
    mission: mission.id, difficulty, outcome: result.outcome, grade: result.grade,
    score: result.score.total, medal: result.medal, fuel: Math.round(result.fuel),
    distance: Math.round(result.distance * 10) / 10, time: Math.round(result.time * 10) / 10,
    date: new Date().toISOString(),
  };
  const newBest = isNewBest(data, attempt);
  data = recordAttempt(data, attempt, unlocksAfter(mission.id, result.outcome));
  save();
  state = 'results';
  hud.show(false);
  const next = MISSIONS.find((m) => m.unlockedBy === mission.id && data.unlocked.includes(m.id));
  UI.renderResults(screens, {
    mission, result, newBest,
    hasNext: result.outcome === 'landed' && !!next,
    onRetry: () => startFlight(mission, difficulty),
    onNext: () => { stopFlight(); state = 'menu'; showBriefing(next, difficulty); },
    onMenu: showTitle,
  });
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state === 'paused') {
    e.preventDefault();
    resumeFlight();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseFlight(); });
window.addEventListener('beforeunload', (e) => {
  if (state === 'flying' || state === 'paused') {
    e.preventDefault();
    e.returnValue = '';
  }
});

showTitle();
```

- [ ] **Step 3: Start with the canvas hidden in `index.html`**

Change `<canvas id="view"></canvas>` to:
```html
  <canvas id="view" class="hidden"></canvas>
```

- [ ] **Step 4: Update `styles.css`**

Delete the `#screens:not(:empty) { … }` rule added in Task 17, then append:
```css
#screens { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 16px; background: rgba(12, 8, 32, 0.35); }
.screen { display: contents; }
.card {
  background: rgba(30, 24, 64, 0.9);
  border: 2px solid var(--panel-edge);
  border-radius: 26px;
  padding: 28px 32px;
  width: min(380px, 100%);
  max-height: calc(100vh - 32px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 10px 0 rgba(10, 6, 30, 0.45);
}
.card.wide { width: min(720px, 100%); }
.card.title { align-items: stretch; text-align: center; }
.card h1 { font-size: 64px; margin: 0; color: #fff; text-shadow: 0 4px 0 var(--accent); }
.card h2 { margin: 0; font-size: 26px; }
.card p { margin: 0; }
.sub, .muted { color: var(--muted); }
button {
  font: 700 16px var(--font);
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid var(--panel-edge);
  border-radius: 14px;
  padding: 10px 18px;
  cursor: pointer;
}
button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
button:focus-visible { outline: 3px solid var(--warn); outline-offset: 2px; }
button.primary { background: var(--accent); border-color: transparent; color: #fff; }
.missions { display: grid; gap: 10px; }
.mission { display: grid; grid-template-columns: 48px 1fr; grid-template-areas: "num name" "num tag" "num bests"; gap: 2px 12px; text-align: left; }
.mission .num { grid-area: num; font-size: 32px; font-weight: 800; align-self: center; text-align: center; }
.mission .name { grid-area: name; font-size: 18px; }
.mission .tag { grid-area: tag; font-weight: 400; font-size: 14px; color: var(--muted); }
.mission .bests { grid-area: bests; display: flex; gap: 16px; font: 400 13px var(--mono); }
.mission.locked { opacity: 0.5; cursor: not-allowed; }
.medal { text-transform: uppercase; font: 800 11px var(--mono); padding: 2px 8px; border-radius: 999px; color: var(--ink); }
.medal.gold { background: #ffd166; }
.medal.silver { background: #d9e2ec; }
.medal.bronze { background: #e0a370; }
.medal.big { font-size: 20px; padding: 6px 18px; align-self: center; }
.facts { margin: 0; padding-left: 18px; color: var(--muted); }
.difficulty { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.difficulty button { display: flex; flex-direction: column; gap: 4px; text-align: left; }
.difficulty button span { font-weight: 400; font-size: 13px; color: var(--muted); }
.difficulty button.sel { border-color: var(--good); background: rgba(75, 227, 172, 0.15); }
.actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
td { padding: 4px 6px; }
td:last-child { text-align: right; font-family: var(--mono); }
.checks tr.perfect td:last-child { color: var(--good); }
.checks tr.safe td:last-child { color: var(--warn); }
.checks tr.crash td:last-child { color: var(--bad); }
.score tr.total td { font-weight: 800; font-size: 18px; border-top: 1px solid var(--panel-edge); }
.results.ok h2 { color: var(--good); }
.results.fail h2 { color: var(--bad); }
.newbest { color: var(--warn); font-weight: 800; }
kbd { font: 700 12px var(--mono); padding: 2px 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--panel-edge); }
.keys td:last-child { text-align: left; font-family: var(--font); }
summary { cursor: pointer; color: var(--muted); }
.field { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.field.check { justify-content: flex-start; }
select, input[type="range"] { font: 600 14px var(--font); }
.spinner { width: 40px; height: 40px; border-radius: 50%; border: 4px solid var(--panel-edge); border-top-color: var(--accent); animation: spin 0.9s linear infinite; align-self: center; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 600px) {
  .difficulty { grid-template-columns: 1fr; }
  .card h1 { font-size: 44px; }
}
```

- [ ] **Step 5: Syntax-check, test and play through**

Run:
```bash
node --check src/ui/screens.js && node --check src/main.js && npm test
```
Expected: all PASS. Then in the browser (`http://localhost:8080/`, use a private window for a clean save):
- Title → Play → Missions shows mission 1 and a locked mission 2 → mission 1 → Briefing (Easy selected) → Launch → loading spinner → flight.
- Esc pauses (menu over the frozen scene); Esc again or Resume continues; Settings from pause changes the HUD size live; Restart reloads the mission; Quit returns to the title.
- Alt-tab away during flight: the game is paused when you come back; no key is stuck.
- Pressing Ctrl+W during flight asks before leaving the page.
- Land safely on mission 1: results show the checks table, the score breakdown and "New best score!"; "Next mission" opens the mission 2 briefing. Reload the page: mission 2 is still unlocked and mission 1 shows its best score.
- Crash: results show the reason in words and Retry works.
- In DevTools run `localStorage.setItem('munlendr.v1', '{broken')` and reload: the game starts normally with fresh progress.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens.js src/main.js index.html styles.css
git commit -m "feat: menus, briefing, pause, results, settings and saved progression"
```

---

### Task 20: README and final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Munlendr

A toon-shaded 3D lunar lander for the browser. Plain HTML and JavaScript, no backend. Progress, best scores and settings are kept in `localStorage`.

## Run

Any static file server works (ES modules do not load from `file://`):

```bash
npm run serve   # http://localhost:8080
```

`debug.html` is a render test bench (terrain, rocket, effects) without game logic.

## Test

```bash
npm test
```

The simulation (`src/sim`, `src/math`), game logic (`src/game`), LOD selection and chunk building (`src/render/planet`), cameras and HUD formatting are covered by Node's built-in test runner. Rendering, HUD layout and input feel are checked by playing.

## Controls

| Action | Keys |
|---|---|
| Throttle up / down | Shift or R / Ctrl or F |
| Full throttle / cut | Z / X |
| Pitch / yaw (tilt) | W S / A D |
| Slide without tilting | I J K L |
| Stability assist | T |
| Camera | C, mouse drag to orbit, wheel to zoom |
| Prediction aids (easy) | G |
| Vehicle view / hide HUD | V / H |
| Pause | Esc |

A gamepad with the standard layout also works (triggers throttle, left stick tilt, D-pad slide, B cut, Y assist, right stick camera).

## Layout

- `src/config.js` — every tunable constant
- `src/sim/` — physics: terrain, gravity, rocket, engine and thrusters, contacts and landing rules, predictions
- `src/game/` — loop, missions and scoring, input, saving, flight session, HUD telemetry
- `src/render/` — Three.js scene, toon materials and outlines, LOD planet (built in Web Workers), rocket and effects, cameras
- `src/hud/`, `src/ui/` — HUD panels and menus
- `docs/` — the concept PDF, the design spec and the implementation plan
````

- [ ] **Step 2: Run the whole test suite**

Run: `npm test`
Expected: every suite PASSES; paste the summary line (tests / pass / fail counts) into the task report.

- [ ] **Step 3: Full manual playtest checklist**

Using `npm run serve` and a desktop browser (or the headless screenshot command from Task 14 for each visual item if no person can look), confirm and note each item:
1. Mission 1 easy: land on the green pad with SAS on; grade shown; mission 2 unlocks.
2. Mission 1 hard: the vehicle-view CoM marker climbs as fuel burns; translating with I/J/K/L adds a slight spin that SAS (T) removes.
3. Mission 2 easy: the burn-now height and impact ring help kill the 60 m/s drift; landing within 50 m gives a medal.
4. Running out of RCS: thrusters stop responding and "NO RCS" shows; running out of fuel: the plume dies and "NO FUEL" shows.
5. Each camera keeps its own zoom/orbit when you switch away and back; with the default control frame, W always tilts away from the camera.
6. Resize the window: the canvas, outlines and HUD adapt without stretching.
7. No errors in the browser console during any of the above.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with run, test and controls"
```
