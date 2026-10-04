import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../src/math/vec3.js';
import * as Q from '../src/math/quat.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const closeV = (a, b, eps = 1e-9) => a.forEach((x, i) => close(x, b[i], eps));

test('vec3 basics', () => {
  closeV(V.add([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
  closeV(V.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  close(V.length([3, 4, 0]), 5);
  closeV(V.normalize([0, 0, 5]), [0, 0, 1]);
  closeV(V.normalize([0, 0, 0]), [0, 0, 0]);
  close(V.angleBetween([1, 0, 0], [0, 1, 0]), Math.PI / 2);
  closeV(V.addScaled([1, 1, 1], [1, 2, 3], 2), [3, 5, 7]);
});

test('quat rotate 90 degrees about Z maps X to Y', () => {
  const q = Q.fromAxisAngle([0, 0, 1], Math.PI / 2);
  closeV(Q.rotate(q, [1, 0, 0]), [0, 1, 0], 1e-12);
});

test('fromBasis: identity and round trip', () => {
  closeV(Q.fromBasis([1, 0, 0], [0, 1, 0], [0, 0, 1]), [1, 0, 0, 0]);
  const q = Q.fromAxisAngle(V.normalize([1, 2, 3]), 1.1);
  const q2 = Q.fromBasis(Q.rotate(q, [1, 0, 0]), Q.rotate(q, [0, 1, 0]), Q.rotate(q, [0, 0, 1]));
  const d = Math.abs(q.reduce((s, c, i) => s + c * q2[i], 0));
  close(d, 1, 1e-9);
});

test('integrate body rate about +X by 90 degrees tips +Z to -Y', () => {
  let q = Q.identity();
  const steps = 1000, dt = (Math.PI / 2) / steps;
  for (let i = 0; i < steps; i++) q = Q.integrate(q, [1, 0, 0], dt);
  closeV(Q.rotate(q, [0, 0, 1]), [0, -1, 0], 1e-3);
});

test('slerp halfway', () => {
  const h = Q.slerp(Q.identity(), Q.fromAxisAngle([0, 0, 1], Math.PI / 2), 0.5);
  closeV(Q.rotate(h, [1, 0, 0]), [Math.SQRT1_2, Math.SQRT1_2, 0], 1e-9);
});
