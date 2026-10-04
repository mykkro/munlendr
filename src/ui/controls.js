// Help content shared by the "How to play" screen and the mission briefing.
// `codes` lists the KeyboardEvent.code values a row explains (a test keeps it in sync with input.js).
export const CONTROL_GROUPS = [
  {
    title: 'Engine',
    rows: [
      { keys: ['Shift', 'R'], codes: ['ShiftLeft', 'ShiftRight', 'KeyR'], pad: 'RT', action: 'Throttle up (hold)' },
      { keys: ['Ctrl', 'F'], codes: ['ControlLeft', 'ControlRight', 'KeyF'], pad: 'LT', action: 'Throttle down (hold)' },
      { keys: ['Z'], codes: ['KeyZ'], pad: '', action: 'Full throttle' },
      { keys: ['X'], codes: ['KeyX'], pad: 'B', action: 'Cut the engine' },
    ],
  },
  {
    title: 'Tilt & slide',
    rows: [
      { keys: ['W', 'S'], codes: ['KeyW', 'KeyS'], pad: 'L-stick up/down', action: 'Tilt away from / towards the camera' },
      { keys: ['A', 'D'], codes: ['KeyA', 'KeyD'], pad: 'L-stick left/right', action: 'Tilt left / right' },
      { keys: ['I', 'J', 'K', 'L'], codes: ['KeyI', 'KeyJ', 'KeyK', 'KeyL'], pad: 'D-pad', action: 'Slide sideways without tilting' },
      { keys: ['T'], codes: ['KeyT'], pad: 'Y', action: 'Stability assist on / off (stops spinning)' },
    ],
  },
  {
    title: 'Camera',
    rows: [
      { keys: ['C'], codes: ['KeyC'], pad: '', action: 'Next view: chase, orbit, top-down, surface' },
      { keys: ['Drag'], pad: 'R-stick', action: 'Orbit the camera' },
      { keys: ['Wheel'], pad: '', action: 'Zoom' },
    ],
  },
  {
    title: 'Display',
    rows: [
      { keys: ['G'], codes: ['KeyG'], pad: '', action: 'Prediction aids on / off (easy mode)' },
      { keys: ['V'], codes: ['KeyV'], pad: '', action: 'Vehicle view on / off' },
      { keys: ['H'], codes: ['KeyH'], pad: '', action: 'Hide / show the HUD' },
      { keys: ['Esc'], codes: ['Escape'], pad: 'Start', action: 'Pause, help and settings' },
    ],
  },
];

export const TIPS = [
  'The main engine is slow: it needs half a second to light and almost a second to reach the throttle you set. Set the throttle early.',
  'The side thrusters are fast. Tilt against your drift to kill sideways speed, then stand the lander upright again before touchdown.',
  'Touch down slower than 2.5 m/s, sliding less than 1.5 m/s, tilted less than 10°, then cut the engine and stay upright for 3 seconds.',
  'In easy mode, "Burn at" shows the height where a full-throttle burn stops your fall. When AGL gets close to it, burn.',
];

export const HUD_GUIDE = [
  ['AGL', 'Height above the ground right under you'],
  ['Vertical', 'Climb (+) or fall (−) speed: green under 2, yellow under 5, red above'],
  ['CMD / ACT', 'The throttle you asked for and what the engine really gives'],
  ['Attitude ball', 'Your tilt from vertical; the ⊗ marker shows where to point to brake'],
  ['Navigation', 'Distance and direction to the green landing pad'],
  ['Vehicle', 'Fuel and RCS tanks, the centre of mass and which thrusters fire'],
];
