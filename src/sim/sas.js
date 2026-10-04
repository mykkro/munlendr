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
