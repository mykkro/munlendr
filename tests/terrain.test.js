import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerrain } from '../src/sim/terrain.js';
import { normalize, add, scale, cross } from '../src/math/vec3.js';

const R = 250000;
function randomDirs(n, seed = 1) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => normalize([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]));
}
function nudge(dir, meters) {
  const t = normalize(cross(dir, [0.3, 0.5, 0.8]));
  return normalize(add(dir, scale(t, meters / R)));
}

test('deterministic for the same seed, different for another seed', () => {
  const a = createTerrain({ seed: 7, radius: R });
  const b = createTerrain({ seed: 7, radius: R });
  const c = createTerrain({ seed: 8, radius: R });
  const dirs = randomDirs(50);
  dirs.forEach((d) => assert.equal(a.height(d), b.height(d)));
  assert.ok(dirs.some((d) => a.height(d) !== c.height(d)));
});

test('continuous: 5 cm apart never differs by more than 0.2 m', () => {
  const t = createTerrain({ seed: 3, radius: R });
  for (const d of randomDirs(300, 9)) {
    assert.ok(Math.abs(t.height(d) - t.height(nudge(d, 0.05))) < 0.2);
  }
});

test('bounded heights', () => {
  const t = createTerrain({ seed: 11, radius: R });
  for (const d of randomDirs(500, 5)) assert.ok(Math.abs(t.height(d)) < 3000);
});

test('explicit pad is perfectly flat inside its inner radius', () => {
  const site = normalize([0.4, 0.3, 0.86]);
  const t = createTerrain({ seed: 5, radius: R, pads: [{ dir: site, radius: 60 }] });
  const h0 = t.height(site);
  for (const m of [5, 20, 40]) assert.ok(Math.abs(t.height(nudge(site, m)) - h0) < 1e-9);
});

test('padsNear finds procedural pads that are flat at their centre', () => {
  const t = createTerrain({ seed: 21, radius: R });
  const pads = t.padsNear(normalize([0.1, 0.9, 0.2]), 5000);
  assert.ok(pads.length > 0);
  const p = pads[0];
  assert.ok(Math.abs(t.height(nudge(p.dir, p.radius * 0.3)) - t.height(p.dir)) < 1e-9);
});

test('fast enough for chunk building', () => {
  const t = createTerrain({ seed: 2, radius: R });
  const dirs = randomDirs(20000, 4);
  const start = performance.now();
  for (const d of dirs) t.height(d);
  assert.ok(performance.now() - start < 3000);
});
