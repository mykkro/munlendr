# Moon Lander

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

## Credits

- [Three.js](https://threejs.org) (MIT), vendored in `vendor/three/`.
- Title font [Fredoka](https://github.com/hafontia/Fredoka-One) (SIL Open Font License 1.1), vendored in `vendor/fonts/` with its licence.
- The title illustration `assets/title.svg` was drawn for this project.
