import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig, controlFrame, VIEW_ORDER } from '../src/render/cameras.js';
import { latLonToDir, tangentBasis } from '../src/sim/frame.js';
import { scale, sub, dot, add } from '../src/math/vec3.js';

const R = 250000;
const site = latLonToDir(8, 23);
const { east, north } = tangentBasis(site);
const sitePoint = scale(site, R);
const rocketPos = scale(site, R + 100);
const ctx = { rocketPos, siteDir: site, sitePoint };

test('chase sits behind and above a rocket moving east; W means east', () => {
  const rig = new CameraRig();
  for (let i = 0; i < 10; i++) rig.updateHeading(rocketPos, scale(east, 30), 0.5);
  const pose = rig.pose(ctx);
  const rel = sub(pose.position, rocketPos);
  assert.ok(dot(rel, east) < 0);
  assert.ok(dot(rel, site) > 0);
  assert.ok(dot(controlFrame(pose, rocketPos).forward, east) > 0.99);
});

test('top-down looks down at the site with north as screen-up', () => {
  const rig = new CameraRig();
  rig.active = 'topdown';
  rig.updateHeading(rocketPos, [0, 0, 0], 0.1);
  const near = add(rocketPos, scale(east, 300));
  const pose = rig.pose({ ...ctx, rocketPos: near });
  assert.ok(dot(sub(pose.position, sitePoint), site) > 100);
  assert.ok(dot(controlFrame(pose, near).forward, north) > 0.99);
});

test('surface view uses its dist as the field of view', () => {
  const rig = new CameraRig();
  rig.active = 'surface';
  rig.updateHeading(rocketPos, [0, 0, 0], 0.1);
  assert.equal(rig.pose(ctx).fov, rig.views.surface.dist);
});

test('each view keeps its own orbit and zoom', () => {
  const rig = new CameraRig();
  rig.active = 'orbit';
  const yaw0 = rig.views.orbit.yaw;
  rig.orbit(30, 0);
  rig.zoom(2);
  assert.equal(rig.views.orbit.yaw, (yaw0 + 30) % 360);
  assert.equal(rig.views.chase.yaw, 0);
  rig.cycle(); rig.cycle(); rig.cycle(); rig.cycle();
  assert.equal(rig.active, 'orbit');
  assert.equal(rig.views.orbit.yaw, (yaw0 + 30) % 360);
});

test('zoom and pitch are clamped; invert flips drag', () => {
  const rig = new CameraRig();
  rig.zoom(1000);
  assert.equal(rig.views.chase.dist, 400);
  rig.orbit(0, 1000);
  assert.equal(rig.views.chase.pitch, 85);
  rig.invertDrag = true;
  rig.orbit(10, 0);
  assert.equal(rig.views.chase.yaw, 350);
});

test('cycle order', () => {
  const rig = new CameraRig();
  assert.deepEqual(VIEW_ORDER.slice(1).map(() => rig.cycle()), ['orbit', 'topdown', 'surface']);
});
