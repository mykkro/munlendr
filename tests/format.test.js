import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vsLevel, fmt, fmtSigned, fmtDistance, fmtClock, fmtBearing, compass, burnLevel, escapeHtml } from '../src/hud/format.js';

test('vertical speed colours: green < 2, yellow < 5, else red (either sign)', () => {
  assert.equal(vsLevel(-1.99), 'good');
  assert.equal(vsLevel(-2), 'warn');
  assert.equal(vsLevel(4.99), 'warn');
  assert.equal(vsLevel(-5), 'bad');
});

test('number formatting', () => {
  assert.equal(fmt(3.14159, 2), '3.14');
  assert.equal(fmt(NaN), '—');
  assert.equal(fmt(-0.3), '0');
  assert.equal(fmtSigned(2.25, 1), '+2.3');
  assert.equal(fmtSigned(-0.01, 1), '0.0');
  assert.equal(fmtDistance(9999), '9999 m');
  assert.equal(fmtDistance(12345), '12.3 km');
  assert.equal(fmtClock(75.9), '01:15');
  assert.equal(fmtBearing(5), '005°');
  assert.equal(fmtBearing(null), '—');
  assert.equal(compass(90), 'E');
  assert.equal(compass(350), 'N');
});

test('burn-now urgency', () => {
  assert.equal(burnLevel(500, 100), 'good');
  assert.equal(burnLevel(150, 100), 'warn');
  assert.equal(burnLevel(105, 100), 'bad');
  assert.equal(burnLevel(100, Infinity), 'bad');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
});

test('compass takes translated points', () => {
  const cz = 'S,SV,V,JV,J,JZ,Z,SZ'.split(',');
  assert.equal(compass(90, cz), 'V');
  assert.equal(compass(225, cz), 'JZ');
  assert.equal(compass(null, cz), '');
});
