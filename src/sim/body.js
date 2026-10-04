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
