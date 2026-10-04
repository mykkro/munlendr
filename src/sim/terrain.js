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
