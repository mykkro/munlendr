import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/sim/physics.js';
import { computeContacts, touchdownMetrics, gradeTouchdown, LandingJudge, tiltDeg } from '../src/sim/contact.js';
import { createRocketState } from '../src/sim/rocket.js';
import { createBody } from '../src/sim/body.js';
import { latLonToDir, tangentBasis } from '../src/sim/frame.js';
import { fromBasis, fromAxisAngle, multiply } from '../src/math/quat.js';
import { scale } from '../src/math/vec3.js';
import { CONFIG } from '../src/config.js';

const dt = 1 / 120;
const R = CONFIG.moon.radius;
const flat = createBody({ radius: R, gm: CONFIG.moon.gm, terrain: { height: () => 0 } });
const site = latLonToDir(10, 20);
const { east, north } = tangentBasis(site);

function upright({ feetAbove, vDown, tilt = 0 }) {
  let q = fromBasis(east, north, site);
  if (tilt) q = multiply(fromAxisAngle(east, (tilt * Math.PI) / 180), q);
  return createRocketState({ position: scale(site, R + 3.4 + feetAbove), velocity: scale(site, -vDown), orientation: q, fuel: 300 });
}

function simulateLanding(s, { maxTime = 12, throttle = 0 } = {}) {
  const judge = new LandingJudge();
  const env = { body: flat, difficulty: 'easy' };
  for (let t = 0; t < maxTime; t += dt) {
    const info = step(s, { throttle }, env, dt);
    const status = judge.update({
      contact: info.contact,
      engineOff: !s.engineOn && s.ignition === 0,
      tiltDeg: tiltDeg(s),
      metricsFn: () => touchdownMetrics(s, info.contact, flat),
      dt,
    });
    if (status === 'landed' || status === 'crashed') break;
  }
  return judge;
}

const contactOf = (anyFoot, hullHit = false) => ({ anyFoot, hullHit });
const good = () => ({ vs: 0.5, hs: 0.1, tilt: 1, rate: 0.5, slope: 1 });

test('soft touchdown at about 2 m/s lands with a safe grade', () => {
  const j = simulateLanding(upright({ feetAbove: 0.5, vDown: 1.5 }));
  assert.equal(j.status, 'landed');
  assert.equal(j.grade, 'safe');
});

test('very gentle touchdown is perfect', () => {
  const j = simulateLanding(upright({ feetAbove: 0.05, vDown: 0.3 }));
  assert.equal(j.status, 'landed');
  assert.equal(j.grade, 'perfect');
});

test('hard touchdown crashes on vertical speed', () => {
  const j = simulateLanding(upright({ feetAbove: 0.1, vDown: 4 }));
  assert.equal(j.status, 'crashed');
  assert.equal(j.reason, 'vs');
});

test('tilted touchdown crashes on tilt', () => {
  const j = simulateLanding(upright({ feetAbove: 1, vDown: 0.5, tilt: 20 }));
  assert.equal(j.status, 'crashed');
  assert.equal(j.reason, 'tilt');
});

test('hull below ground is a hull hit', () => {
  // body X = north, body Y = up, body Z = east: lying on its side, centre 1 m above ground
  const lying = createRocketState({ position: scale(site, R + 1.0), velocity: [0, 0, 0], orientation: fromBasis(north, site, east), fuel: 300 });
  assert.equal(computeContacts(lying, 0, flat).hullHit, true);
});

test('far above ground there is no contact work', () => {
  const c = computeContacts(upright({ feetAbove: 100, vDown: 0 }), 0, flat);
  assert.equal(c.anyFoot, false);
  assert.equal(c.feet.length, 0);
});

test('grade boundaries: values equal to a threshold fall into the worse grade', () => {
  assert.equal(gradeTouchdown({ ...good(), vs: 1.0 }).grade, 'safe');
  assert.equal(gradeTouchdown({ ...good(), vs: 2.5 }).grade, 'crash');
  assert.equal(gradeTouchdown({ ...good(), slope: 9.99 }).grade, 'safe');
  assert.equal(gradeTouchdown(good()).grade, 'perfect');
});

test('engine still running keeps the rocket in touchdown; cutting it lands after 3 s', () => {
  const j = new LandingJudge();
  for (let t = 0; t < 5; t += dt) j.update({ contact: contactOf(true), engineOff: false, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.status, 'touchdown');
  for (let t = 0; t < 3.1; t += dt) j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.status, 'landed');
});

test('a hop longer than 1 s resets the touchdown', () => {
  const j = new LandingJudge();
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  for (let t = 0; t < 1.2; t += dt) j.update({ contact: contactOf(false), engineOff: false, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.status, 'flying');
  assert.equal(j.grade, null);
});

test('bounce keeps the worse grade', () => {
  const j = new LandingJudge();
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: () => ({ ...good(), vs: 2 }), dt });
  j.update({ contact: contactOf(false), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  assert.equal(j.grade, 'safe');
});

test('tipping past 10 degrees during settle is a crash', () => {
  const j = new LandingJudge();
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 1, metricsFn: good, dt });
  j.update({ contact: contactOf(true), engineOff: true, tiltDeg: 12, metricsFn: good, dt });
  assert.equal(j.status, 'crashed');
  assert.equal(j.reason, 'tipped');
});
