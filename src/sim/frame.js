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
