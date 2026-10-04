import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faceDir, dirToFaceST, nodeKey, nodeContaining } from '../src/render/planet/cubesphere.js';
import { selectNodes } from '../src/render/planet/quadtree.js';
import { buildChunk, buildIndices, GRID, VERTEX_COUNT } from '../src/render/planet/chunk-builder.js';
import { createTerrain } from '../src/sim/terrain.js';
import { normalize, scale, length, dot } from '../src/math/vec3.js';

const R = 250000;
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('faceDir and dirToFaceST round trip on every face', () => {
  for (let face = 0; face < 6; face++) {
    for (const [s, t] of [[0, 0], [0.5, -0.3], [-0.9, 0.9]]) {
      const back = dirToFaceST(faceDir(face, s, t));
      assert.equal(back.face, face);
      close(back.s, s, 1e-9);
      close(back.t, t, 1e-9);
    }
  }
});

function noOverlap(nodes) {
  for (const a of nodes) for (const b of nodes) {
    if (a === b || a.face !== b.face || b.level <= a.level) continue;
    const k = b.level - a.level;
    assert.ok(!((b.x >> k) === a.x && (b.y >> k) === a.y), `${nodeKey(a)} overlaps ${nodeKey(b)}`);
  }
}

test('a low camera refines to the max level directly beneath it', () => {
  const dir = normalize([0.3, 0.4, 0.86]);
  const { nodes, pending } = selectNodes({ cameraPos: scale(dir, R + 50), radius: R, maxLevel: 14, isReady: () => true, request: () => {} });
  assert.equal(pending, 0);
  assert.ok(nodes.some((n) => nodeKey(n) === nodeKey(nodeContaining(dir, 14))));
  assert.ok(nodes.length < 800);
  noOverlap(nodes);
});

test('terrain height under the camera is respected when splitting', () => {
  const dir = normalize([0.3, 0.4, 0.86]);
  const { nodes } = selectNodes({ cameraPos: scale(dir, R + 900 + 50), radius: R, maxLevel: 14, centerHeight: () => 900, isReady: () => true, request: () => {} });
  assert.ok(nodes.some((n) => nodeKey(n) === nodeKey(nodeContaining(dir, 14))));
});

test('nothing ready: roots are requested and nothing is drawn', () => {
  const requested = [];
  const { nodes, pending } = selectNodes({ cameraPos: scale(normalize([0.3, 0.4, 0.86]), R + 50), radius: R, maxLevel: 14, isReady: () => false, request: (n) => requested.push(n) });
  assert.equal(nodes.length, 0);
  assert.ok(pending > 0);
  assert.ok(requested.some((n) => n.level === 0));
});

test('parents stay visible while children load', () => {
  const dir = normalize([0.3, 0.4, 0.86]);
  const { nodes, pending } = selectNodes({ cameraPos: scale(dir, R + 50), radius: R, maxLevel: 14, isReady: (n) => n.level <= 3, request: () => {} });
  assert.ok(nodes.length > 0);
  assert.ok(nodes.every((n) => n.level <= 3));
  assert.ok(pending > 0);
  noOverlap(nodes);
});

test('flat terrain chunk lies on the sphere with radial normals', () => {
  const c = buildChunk({ face: 4, level: 5, x: 10, y: 12 }, { height: () => 0 }, R);
  assert.equal(c.positions.length, VERTEX_COUNT * 3);
  for (let i = 0; i < GRID * GRID; i++) {
    const p = [c.positions[i * 3] + c.center[0], c.positions[i * 3 + 1] + c.center[1], c.positions[i * 3 + 2] + c.center[2]];
    close(length(p), R, 0.05);
    const n = [c.normals[i * 3], c.normals[i * 3 + 1], c.normals[i * 3 + 2]];
    close(dot(n, normalize(p)), 1, 1e-4);
  }
});

test('neighbouring chunks share their edge vertices', () => {
  const terrain = createTerrain({ seed: 3, radius: R });
  const a = buildChunk({ face: 0, level: 8, x: 100, y: 120 }, terrain, R);
  const b = buildChunk({ face: 0, level: 8, x: 101, y: 120 }, terrain, R);
  for (let j = 0; j < GRID; j++) {
    const ia = (j * GRID + GRID - 1) * 3, ib = j * GRID * 3;
    for (let c = 0; c < 3; c++) close(a.positions[ia + c] + a.center[c], b.positions[ib + c] + b.center[c], 0.02);
  }
});

test('indices cover the grid and both-sided skirts', () => {
  const idx = buildIndices();
  assert.equal(idx.length, (32 * 32 * 2 + 4 * 32 * 4) * 3);
  assert.ok(Math.max(...idx) < VERTEX_COUNT);
});
