import { cross, dot, normalize, sub } from '../../math/vec3.js';
import { faceDir, nodeSize, nodeCenterDir, nodeEdgeLength } from './cubesphere.js';

export const GRID = 33;
const SEG = GRID - 1;
export const VERTEX_COUNT = GRID * GRID + 4 * GRID;

function edgeLists() {
  const v = (i, j) => j * GRID + i;
  const bottom = [], top = [], left = [], right = [];
  for (let k = 0; k < GRID; k++) {
    bottom.push(v(k, 0));
    top.push(v(k, SEG));
    left.push(v(0, k));
    right.push(v(SEG, k));
  }
  return [bottom, top, left, right];
}
const EDGES = edgeLists();

export function buildIndices() {
  const idx = [];
  const v = (i, j) => j * GRID + i;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
    idx.push(a, b, c, b, d, c);
  }
  EDGES.forEach((list, e) => {
    const base = GRID * GRID + e * GRID;
    for (let k = 0; k < SEG; k++) {
      const a = list[k], b = list[k + 1], c = base + k, d = base + k + 1;
      idx.push(a, b, c, b, d, c, a, c, b, b, c, d); // both windings so skirts show from either side
    }
  });
  return new Uint16Array(idx);
}

const srgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => (c / 255) ** 2.2);
const GROUND = srgb(0xbdb4da);
const STEEP = srgb(0x8b81b3);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildChunk(node, terrain, radius) {
  const size = nodeSize(node.level);
  const s0 = -1 + node.x * size, t0 = -1 + node.y * size, step = size / SEG;
  const E = GRID + 2; // one extra vertex on every side so normals match across chunk borders
  const pts = new Float64Array(E * E * 3), dirs = new Float64Array(E * E * 3);
  for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) {
    const d = faceDir(node.face, s0 + (i - 1) * step, t0 + (j - 1) * step);
    const r = radius + terrain.height(d);
    const o = (j * E + i) * 3;
    dirs[o] = d[0]; dirs[o + 1] = d[1]; dirs[o + 2] = d[2];
    pts[o] = d[0] * r; pts[o + 1] = d[1] * r; pts[o + 2] = d[2] * r;
  }
  const P = (i, j) => { const o = ((j + 1) * E + (i + 1)) * 3; return [pts[o], pts[o + 1], pts[o + 2]]; };
  const D = (i, j) => { const o = ((j + 1) * E + (i + 1)) * 3; return [dirs[o], dirs[o + 1], dirs[o + 2]]; };

  const cd = nodeCenterDir(node);
  const ch = radius + terrain.height(cd);
  const center = [cd[0] * ch, cd[1] * ch, cd[2] * ch];
  const positions = new Float32Array(VERTEX_COUNT * 3);
  const normals = new Float32Array(VERTEX_COUNT * 3);
  const colors = new Float32Array(VERTEX_COUNT * 3);

  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const o = (j * GRID + i) * 3;
    const p = P(i, j);
    const n = normalize(cross(sub(P(i + 1, j), P(i - 1, j)), sub(P(i, j + 1), P(i, j - 1))));
    const w = smoothstep(0.02, 0.12, 1 - dot(n, D(i, j)));
    for (let c = 0; c < 3; c++) {
      positions[o + c] = p[c] - center[c];
      normals[o + c] = n[c];
      colors[o + c] = GROUND[c] + (STEEP[c] - GROUND[c]) * w;
    }
  }

  const depth = nodeEdgeLength(node, radius) * 0.02 + 2;
  EDGES.forEach((list, e) => list.forEach((vi, k) => {
    const dst = (GRID * GRID + e * GRID + k) * 3, src = vi * 3;
    const i = vi % GRID, j = Math.floor(vi / GRID);
    const p = P(i, j), d = D(i, j);
    for (let c = 0; c < 3; c++) {
      positions[dst + c] = p[c] - d[c] * depth - center[c];
      normals[dst + c] = normals[src + c];
      colors[dst + c] = colors[src + c];
    }
  }));

  let boundingRadius = 0;
  for (let k = 0; k < positions.length; k += 3) {
    boundingRadius = Math.max(boundingRadius, Math.hypot(positions[k], positions[k + 1], positions[k + 2]));
  }
  return { center, positions, normals, colors, boundingRadius };
}
