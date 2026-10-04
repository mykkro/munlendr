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
