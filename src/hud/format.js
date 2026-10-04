export function vsLevel(vs) {
  const a = Math.abs(vs);
  return a < 2 ? 'good' : a < 5 ? 'warn' : 'bad';
}

export function fmt(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s; // no "-0" for values that round to zero
}

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
export const compass = (deg, points = POINTS) => (deg == null ? '' : points[Math.round(deg / 45) % 8]);

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
