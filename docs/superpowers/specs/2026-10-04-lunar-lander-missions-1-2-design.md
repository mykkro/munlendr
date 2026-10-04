# Lunar Lander — Missions 1–2 Design

Date: 2026-10-04
Source concept: `docs/specs/Lunar Lander – Physics & Controls Design.pdf` (the "PDF"). This spec
implements the PDF for missions 1–2; where this spec is silent, the PDF applies.

## 1. Goal and scope

A playable 3D browser lunar lander: missions 1 (First touchdown) and 2 (Pinpoint) on a procedurally
generated small moon, with the PDF's full physics, controls, cameras and HUD, a toon/cel-shaded look,
mission progression and saved scores.

**In scope**
- Full physics per the PDF: Moon-centred point-mass gravity, rocket equation, slow main engine, eight
  fast side thrusters (rotate and translate), separate main and RCS tanks, easy/hard centre of mass,
  stability assist (SAS), spring-damper legs, landing grading.
- Whole-planet quadtree LOD terrain (cube-sphere), so later orbital missions need no new terrain system.
- Four cameras with per-view orbit and zoom; keyboard plus optional gamepad.
- Full HUD (five panels, status strip, auxiliary vehicle view, easy-mode prediction aids).
- Screens: title, mission select, briefing, flight, pause, results, settings.
- localStorage persistence: unlocks, best results per difficulty, recent attempts, settings.

**Out of scope (later)**
- Missions 3, 4, 5+; time warp; real-scale Moon; real lunar elevation data.
- Sound.

## 2. Technical constraints

- Pure static HTML/CSS/JavaScript (ES modules), no backend, no build step. Served by any static server
  (`npx serve`, VS Code Live Server, GitHub Pages). `file://` is not supported.
- Three.js (plus any needed example add-ons) vendored under `vendor/` and loaded via an import map.
  No runtime npm dependencies.
- Unit tests use Node's built-in `node:test` (Node 24 available); no test dependencies.
- Target: current desktop Chrome, Firefox and Edge with WebGL2.

## 3. Architecture

Hard rule: **`src/sim/` and `src/math/` never import Three.js and never touch the DOM.** They are pure,
float64, deterministic and testable in Node. Rendering and HUD only read sim state.

```
index.html, styles.css
vendor/three.module.js (+ add-ons)
src/config.js                     all tunable constants (PDF tuning table + values below)
src/math/        vec3.js, quat.js
src/sim/
  body.js        planet: GM, R, terrain; gravity(r), agl(r), groundNormal(r), slopeAt(r)
  terrain.js     seeded height(dir) → metres above R: noise, craters, boulders, flat pads
  rocket.js      state, masses, centre of mass (easy/hard), inertia about CoM
  actuators.js   engine lag/rate-limit/ignition; 8 thruster ramps; propellant cut-off
  sas.js         rate-damping controller
  physics.js     step(state, commands, dt): actuators → forces/torques → integrate → burn
  contact.js     legs, hull probes, touchdown grading, settle/tip-over logic
  predict.js     impact point, burn-now height, prograde/retrograde vectors
src/game/
  loop.js        fixed-step accumulator, spiral guard, interpolation alpha
  input.js       keyboard + gamepad → commands; camera- or body-relative mapping
  missions.js    mission definitions, goals, medals, scoring
  storage.js     versioned localStorage wrapper with safe fallback
  session.js     one flight: setup → fly → outcome
src/render/
  scene.js       renderer, floating origin, sun, sky dome, starfield, post pass
  toon.js        cel materials, outline post-process, rocket inverted-hull outline
  planet/        quadtree.js, chunk-worker.js, chunk-cache.js
  rocket-model.js, plumes.js, dust.js, debris.js, markers.js
  cameras.js     chase, orbit, top-down, surface; per-view yaw/pitch/zoom
src/hud/         panels (DOM/CSS), attitude-ball.js and vehicle-view.js (canvas 2D)
src/ui/          title, mission-select, briefing, pause, results, settings
tests/           node:test suites for sim and game logic
```

`terrain.js` is the single source of ground truth: physics calls it directly, and the chunk worker
calls the same function to build meshes.

## 4. Simulation

### 4.1 World
- One Moon-centred Cartesian frame, SI units, float64.
- Small moon for missions 1–2: **R = 250 000 m, GM = 1.0125×10¹¹ m³/s²** (surface g = 1.62 m/s²;
  surface circular speed ≈ 636 m/s). No rotation, no atmosphere.
- Gravity: `a = −GM·r/|r|³`.
- Local frame at the landing site: x = east, y = north, z = up. Target at local (0, 0). All HUD values
  are expressed in this frame (altitude/up taken from the rocket's own radial direction).
- Altitude = |r| − R. AGL = |r| − (R + height(r̂)). Landing logic uses AGL.

### 4.2 Terrain (`terrain.js`)
`height(dir, seed)` returns metres above R for a unit direction. Built from:
- multi-octave value/simplex noise for rolling ground (large scale, gentle);
- craters: seeded set at several size classes (bowl + raised rim profile);
- boulders: seeded small bumps (0.5–3 m radius) placed in fields, part of the height function so
  anything visible is collidable;
- flat pads: seeded circular zones where the height is blended to a constant (slope < 2°); mission 2's
  target sits on a pad; mission 1 marks pads near its ground track as hints.

It must be deterministic for a given seed, continuous, and cheap enough for the worker to build a 33×33
chunk in a few milliseconds. Normals and slopes come from central differences of `height`.

### 4.3 Rocket state and mass (`rocket.js`)
- State: position r, velocity v, orientation q (body +Z = long axis, engine pushes +Z), angular
  velocity ω (body frame), main fuel mass, RCS mass, actual throttle, ignition timer, thruster
  outputs[8] ∈ [0, 1].
- Mass m = dry + fuel + RCS. Values per the PDF tuning table (dry 2000 kg, 6 m tall, 1.5 m radius,
  12 kN, Isp 311 s, RCS 60 kg at Isp 220 s, thrusters 400 N).
- Thruster rings fixed at ±3 m from the geometric centre (body z = 0).
- Centre of mass along body z:
  - Easy: z_cm = 0.
  - Hard: mass-weighted average of dry (z = 0), main fuel (z = −1.5 m), RCS (z = +1.0 m), every step.
  - L_top = 3 − z_cm, L_bot = 3 + z_cm.
- Transverse inertia: `I = m(3r² + h²)/12 + m·z_cm²` (parallel axis). Roll is not modelled: the body-z
  component of ω is zeroed every step.

### 4.4 Actuators (`actuators.js`)
- Commanded throttle θ_cmd ∈ [0, 1]; values below 0.10 mean engine off.
- Engine on from off: ignition delay 0.5 s with zero thrust, then θ_act follows
  `dθ/dt = clamp((θ_cmd − θ_act)/τ, −k, k)`, τ = 0.8 s, k = 0.6/s. θ_act is held ≥ 0.10 while running.
  Command to off: θ_act ramps down at the same limits and the engine is off once it falls below 0.10.
- No main fuel → thrust 0, engine off.
- Thrusters: each output follows its on/off command with a 0.05 s first-order time constant. No RCS
  propellant → commands forced off.
- Thruster layout (body frame): ring top (z = +3) and bottom (z = −3), each with +X, −X, +Y, −Y.
  - Pitch/yaw = top and bottom of the same axis fire opposite directions (pure torque in easy mode).
  - Translate = top and bottom fire the same direction (pure force in easy mode; residual torque in
    hard mode from L_top ≠ L_bot).
- Fuel burn per step: main `F/(Isp·g₀)·dt`, RCS `Σ(output·400 N)/(220·g₀)·dt`, g₀ = 9.80665.

### 4.5 SAS (`sas.js`)
When enabled, if |ω| > 0.5 °/s and no rotation key is held, command the pitch/yaw thruster pairs that
oppose ω (per axis, with a small deadband to avoid chatter). It costs RCS propellant, only damps rotation
and never holds a direction. Mission 1 starts with SAS on. SAS is available in both difficulties.

### 4.6 Physics step (`physics.js`)
Fixed dt = 1/120 s:
1. Commands (from input and SAS) → actuators update.
2. Forces: gravity·m; main thrust along body +Z; thruster forces; leg contact forces (from 4.7).
   Torques: thruster lever arms about the CoM; leg forces about the CoM.
3. Semi-implicit Euler: v += a·dt; r += v·dt; ω += I⁻¹τ·dt; zero roll; q integrated from ω and
   normalised.
4. Burn fuel; recompute m, CoM, I.
5. Contact evaluation (4.7).

### 4.7 Contact and landing (`contact.js`)
- Legs: four feet splayed at body (±2.2, 0, −3.4) and (0, ±2.2, −3.4). For each foot below the terrain:
  spring-damper force along the ground normal (stiffness and damping in `config.js`, tuned so a 2 m/s
  touchdown compresses visibly but less than 0.3 m) plus tangential friction damping.
- Hull probes: ~10 points (top cap, bottom rim, mid-body ring). Any probe below the terrain → **crash**.
- Touchdown: on the first foot contact, measure vertical speed and horizontal speed relative to the
  ground, tilt from local vertical, angular rate and ground slope under the feet. Grade with the PDF
  table (Perfect / Safe / Crash). Any crash-level value → **crash**.
- Settle: after a non-crash touchdown the rocket must remain with tilt < 10° for 3 s continuous with the
  engine off → **landed** with the recorded grade. Tilt ≥ 10° during settle → **crash (tipped over)**.
- Re-touch after a bounce keeps the worse grade. All feet off the ground for > 1 s resets the touchdown
  (a hop).
- Running out of fuel is not itself a failure.

### 4.8 Predictions (`predict.js`, easy mode, toggle G)
- Impact point: coarse-step forward simulation (dt 0.1 s, throttle held at the current command,
  no thrusters) until AGL ≤ 0 or 120 s.
- Burn-now height: simulate a full-throttle command from the current state (including ignition delay and
  lag) and report the altitude lost until vertical speed reaches zero; compare with current AGL.
- Prograde/retrograde vectors in the local frame for the attitude ball.
- Run at most ~10 Hz, not every frame.

### 4.9 Loop (`loop.js`)
Each frame: accumulator += elapsed; run physics steps while accumulator ≥ dt, max 8 per frame (excess
time dropped); render with interpolation between the last two states. Pause stops accumulation.

## 5. Rendering

### 5.1 Floating origin and precision
Each frame the camera is at the render origin; every object's render position = world position − camera
world position (subtracted in float64, then cast to float32). Logarithmic depth buffer enabled.

### 5.2 Planet LOD (`render/planet/`)
- Cube-sphere: 6 faces, each a quadtree. A node splits when camera distance < 1.5 × node edge length;
  maximum depth 14 (~0.75 m vertex spacing near the rocket on the 250 km moon).
- Chunks: 33×33 vertices plus skirts; vertices stored relative to the chunk centre.
- A Web Worker builds chunk geometry (positions, normals, per-vertex colour tint for crater floor/rim/
  slope) using `terrain.js`. Results go into an LRU cache. A parent stays visible until all four children
  are ready, so no holes appear.
- A mission start is not shown until the chunks around the rocket and target are loaded (loading
  indicator on the briefing → flight transition).

### 5.3 Toon look (`toon.js`)
- Cel materials with a 3-step gradient for terrain and rocket; pastel palette (lilac/grey-blue ground,
  warm highlights; rocket off-white with one accent colour).
- Screen-space ink outlines: one post pass detecting depth and normal discontinuities (crater rims,
  boulders, horizon). The rocket additionally gets an inverted-hull outline for readability.
- Sky: gradient dome (deep indigo to violet near the horizon) and a sparse starfield. One warm, low
  directional sun.

### 5.4 Effects and markers
- Main plume: rounded additive cone scaled by θ_act with slight flicker. RCS puffs on firing thrusters
  scaled by output.
- Dust ring of soft sprites under the engine when AGL < 20 m and the engine is on.
- Crash: rocket parts separate with simple ballistic motion, flash and debris puff.
- Markers: target ring and vertical beacon; ground dot and dashed drop line under the rocket;
  predicted-impact ghost ring (easy mode, aids on); pad hint rings (mission 1).

### 5.5 Cameras (`cameras.js`)
Views, cycled with C: **chase** (behind and above, following the rocket), **orbit** (free around the
rocket), **top-down** (above the target looking down), **surface** (from the landing site looking at the
rocket). Each view stores its own yaw/pitch/zoom; mouse drag orbits and the wheel zooms only the active
view. The gamepad right stick orbits.

### 5.6 Control frame
Default: thruster keys are camera-relative. W/S/A/D and I/K/J/L are mapped using the active camera's
heading projected onto the local horizontal plane (top-down view: screen-up = forward), then resolved to
the nearest body thruster axes. Setting "Body frame" maps keys directly to body ±X/±Y.

## 6. Controls

Per the PDF: Shift/Ctrl throttle ±50 %/s; Z full; X cut; W/S pitch; A/D yaw; I/K/J/L translate; T SAS;
C camera; mouse drag/wheel for camera. Additions: G prediction aids (easy only), V vehicle view, H hide
HUD, Esc pause. Gamepad (standard mapping): triggers throttle, B cut, left stick pitch/yaw, D-pad
translate, Y SAS, right stick camera. Browser defaults for these keys are prevented during flight.

## 7. HUD

Rounded, translucent DOM panels with chunky monospace numbers; canvas 2D for the attitude ball, mini-map
and vehicle view. Updated at display rate from interpolated state.

| Position | Panel | Contents |
|---|---|---|
| Top centre | Status | Mission, elapsed time, SAS/aids/control-frame chips, messages (CONTACT, HOLD 3…2…1, LOW RCS, LOW FUEL, NO FUEL) |
| Top left | Height | Altitude (km), AGL (m), time to impact = AGL / descent rate; easy+aids: burn-now height vs AGL |
| Left | Velocity | Vertical speed (green < 2, yellow < 5, else red), horizontal speed + direction arrow, total speed |
| Right | Attitude | Attitude ball (axis vs local vertical, prograde/retrograde markers), tilt °, tilt direction, angular rate °/s |
| Bottom centre | Propulsion | Commanded vs actual throttle bars, ignition indicator, fuel kg and %, RCS kg, remaining Δv (rocket equation on main fuel), TWR at current mass and local g |
| Top right | Navigation | Target distance and bearing, x/y offset, mini-map with rocket, target, velocity vector |
| Bottom right | Vehicle view | Side schematic: tank levels, CoM marker with L_top/L_bot, arrows on firing thrusters (toggle V) |

## 8. Screens and flow

Title → Mission select → Briefing → Flight → Results.
- Mission select: card per mission with lock state and best score/medal for Easy and Hard.
- Briefing: goal, start state, Easy/Hard toggle, controls summary, Start.
- Pause (Esc): Resume, Restart, Settings, Quit to menu.
- Results: each landing check vs its thresholds (pass colours), grade, score breakdown, medal, new-best
  marker; Retry / Next mission / Menu.
- Settings: control frame (camera / body), invert camera drag, HUD scale.

## 9. Missions, difficulty and scoring

| # | Name | Start (local frame, upright) | Fuel / RCS | Goal | Unlock |
|---|---|---|---|---|---|
| 1 | First touchdown | 1 500 m AGL, vz −20 m/s, horizontal 30 m/s | 500 kg / 60 kg | Land safely anywhere | Always |
| 2 | Pinpoint | 3 000 m AGL, 2 km from target, 60 m/s toward target | 700 kg / 60 kg | Land within 50/20/5 m for bronze/silver/gold | Safe landing on M1 (either difficulty) |

- Each mission has a fixed terrain seed. Mission 1 starts with SAS on.
- Difficulty chosen per attempt in the briefing:
  - **Easy:** fixed CoM; prediction aids available (default on).
  - **Hard:** realistic CoM; prediction aids unavailable.
- Score (0 on crash): grade (Perfect 1000, Safe 600) + remaining main fuel (1 point per kg) + distance
  bonus on M2 `max(0, 500 − 10·d)` + time bonus `max(0, 300 − t_seconds)`; ×1.5 on Hard. Rounded to
  an integer.

## 10. Persistence (`storage.js`)

Single key `munlendr.v1`:
```json
{
  "version": 1,
  "unlocked": [1, 2],
  "best": { "1": { "easy": {"score": 0, "grade": "safe", "medal": null, "fuel": 0, "distance": 0, "time": 0, "date": "ISO"}, "hard": null } },
  "history": [ {"mission": 1, "difficulty": "easy", "outcome": "landed", "grade": "perfect", "score": 0, "date": "ISO"} ],
  "settings": { "controlFrame": "camera", "invertDrag": false, "hudScale": 1 }
}
```
History keeps the last 10 attempts. All reads and writes are wrapped in try/catch; missing, corrupt or
unknown-version data falls back to defaults, and the game runs normally if storage is unavailable.

## 11. Testing

`node --test tests/` covers sim and game logic:
- Gravity ≈ 1.62 m/s² at the surface; a circular orbit keeps its radius within tolerance over one orbit.
- Fuel use over a burn matches the rocket equation Δv.
- Engine: ignition delay, lag time constant, rate limit, sub-10 % cut-off, no-fuel cut-off.
- Thrusters: rotate pair → zero net force; translate pair → zero net torque (easy) and non-zero torque
  (hard); 50 ms ramp; RCS-empty cut-off.
- Hard-mode CoM rises as fuel burns; inertia matches the formula.
- SAS brings |ω| below the threshold.
- Roll stays zero.
- Contact: grading at each threshold boundary; 3 s settle → landed; tip-over → crash; hull probe → crash;
  hop resets touchdown.
- Terrain is deterministic per seed and flat on pads.
- Scoring, medals, unlocking; storage round-trip and corrupt-data fallback (with a localStorage stub).

Rendering, HUD and input are verified by playing in the browser.
