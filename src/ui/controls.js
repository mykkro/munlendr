// Help content shared by the "How to play" screen and the mission briefing.
// Text values are i18n keys; `codes` lists the KeyboardEvent.code values a row explains
// (a test keeps it in sync with input.js). Key caps starting with "key." are translated too.
export const CONTROL_GROUPS = [
  {
    title: 'ctl.group.engine',
    rows: [
      { keys: ['Shift', 'R'], codes: ['ShiftLeft', 'ShiftRight', 'KeyR'], pad: 'RT', action: 'ctl.throttleUp' },
      { keys: ['Ctrl', 'F'], codes: ['ControlLeft', 'ControlRight', 'KeyF'], pad: 'LT', action: 'ctl.throttleDown' },
      { keys: ['Z'], codes: ['KeyZ'], pad: '', action: 'ctl.full' },
      { keys: ['X'], codes: ['KeyX'], pad: 'B', action: 'ctl.cut' },
    ],
  },
  {
    title: 'ctl.group.tilt',
    rows: [
      { keys: ['W', 'S'], codes: ['KeyW', 'KeyS'], pad: 'pad.lstickUD', action: 'ctl.pitch' },
      { keys: ['A', 'D'], codes: ['KeyA', 'KeyD'], pad: 'pad.lstickLR', action: 'ctl.yaw' },
      { keys: ['I', 'J', 'K', 'L'], codes: ['KeyI', 'KeyJ', 'KeyK', 'KeyL'], pad: 'pad.dpad', action: 'ctl.slide' },
      { keys: ['T'], codes: ['KeyT'], pad: 'Y', action: 'ctl.sas' },
    ],
  },
  {
    title: 'ctl.group.camera',
    rows: [
      { keys: ['C'], codes: ['KeyC'], pad: '', action: 'ctl.camNext' },
      { keys: ['key.drag'], pad: 'pad.rstick', action: 'ctl.orbit' },
      { keys: ['key.wheel'], pad: '', action: 'ctl.zoom' },
    ],
  },
  {
    title: 'ctl.group.display',
    rows: [
      { keys: ['G'], codes: ['KeyG'], pad: '', action: 'ctl.aids' },
      { keys: ['V'], codes: ['KeyV'], pad: '', action: 'ctl.vehicle' },
      { keys: ['H'], codes: ['KeyH'], pad: '', action: 'ctl.hud' },
      { keys: ['Esc'], codes: ['Escape'], pad: 'Start', action: 'ctl.pause' },
    ],
  },
];

export const TIPS = ['tip.1', 'tip.2', 'tip.3', 'tip.4'];

export const HUD_GUIDE = [
  ['hudguide.agl', 'hudguide.agl.d'],
  ['hudguide.vs', 'hudguide.vs.d'],
  ['hudguide.thr', 'hudguide.thr.d'],
  ['hudguide.ball', 'hudguide.ball.d'],
  ['hudguide.nav', 'hudguide.nav.d'],
  ['hudguide.veh', 'hudguide.veh.d'],
];
