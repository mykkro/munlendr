import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, defaultData, recordAttempt, isNewBest, STORAGE_KEY } from '../src/game/storage.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}
const attempt = (over = {}) => ({ mission: 1, difficulty: 'easy', outcome: 'landed', grade: 'safe', score: 1000, medal: null, fuel: 100, distance: 30, time: 80, date: '2026-10-04T12:00:00Z', ...over });

test('round trip', () => {
  const st = createStorage(memory());
  const d = recordAttempt(defaultData(), attempt(), [2]);
  assert.equal(st.save(d), true);
  assert.deepEqual(st.load(), d);
});

test('missing, corrupt or wrong-version data falls back to defaults', () => {
  const b = memory();
  const st = createStorage(b);
  assert.deepEqual(st.load(), defaultData());
  b.map.set(STORAGE_KEY, '{not json');
  assert.deepEqual(st.load(), defaultData());
  b.map.set(STORAGE_KEY, JSON.stringify({ version: 99 }));
  assert.deepEqual(st.load(), defaultData());
});

test('older saves gain new settings keys', () => {
  const b = memory();
  const d = defaultData();
  delete d.settings.hudScale;
  b.map.set(STORAGE_KEY, JSON.stringify(d));
  assert.equal(createStorage(b).load().settings.hudScale, 1);
});

test('language is unset (auto-detect) by default and survives a round trip', () => {
  assert.equal(defaultData().settings.language, null);
  const st = createStorage(memory());
  const d = defaultData();
  d.settings.language = 'cs';
  st.save(d);
  assert.equal(st.load().settings.language, 'cs');
});

test('unavailable or throwing storage never throws', () => {
  assert.deepEqual(createStorage(null).load(), defaultData());
  assert.equal(createStorage(null).save(defaultData()), false);
  const bad = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(createStorage(bad).load(), defaultData());
  assert.equal(createStorage(bad).save(defaultData()), false);
});

test('history keeps the last 10, newest first', () => {
  let d = defaultData();
  for (let i = 0; i < 12; i++) d = recordAttempt(d, attempt({ score: i }), []);
  assert.equal(d.history.length, 10);
  assert.equal(d.history[0].score, 11);
});

test('best only improves, per difficulty; medals keep the best ever', () => {
  let d = recordAttempt(defaultData(), attempt({ mission: 2, score: 900, medal: 'silver' }), []);
  d = recordAttempt(d, attempt({ mission: 2, score: 800, medal: 'gold' }), []);
  assert.equal(d.best['2'].easy.score, 900);
  assert.equal(d.best['2'].easy.medal, 'gold');
  d = recordAttempt(d, attempt({ mission: 2, difficulty: 'hard', score: 10 }), []);
  assert.equal(d.best['2'].hard.score, 10);
  d = recordAttempt(d, attempt({ mission: 2, outcome: 'crashed', score: 0 }), []);
  assert.equal(d.best['2'].easy.score, 900);
});

test('unlocks are a sorted set and isNewBest compares against the stored best', () => {
  let d = recordAttempt(defaultData(), attempt(), [2]);
  d = recordAttempt(d, attempt(), [2]);
  assert.deepEqual(d.unlocked, [1, 2]);
  assert.equal(isNewBest(d, attempt({ score: 999 })), false);
  assert.equal(isNewBest(d, attempt({ score: 1001 })), true);
  assert.equal(isNewBest(d, attempt({ outcome: 'crashed' })), false);
});
