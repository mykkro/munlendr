import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLanguage, getLanguage, detectLanguage, LANGS, onLanguageChange } from '../src/i18n.js';
import { en } from '../src/i18n/en.js';
import { cs } from '../src/i18n/cs.js';
import { CONTROL_GROUPS, TIPS, HUD_GUIDE } from '../src/ui/controls.js';

afterEach(() => setLanguage('en'));

test('both languages have exactly the same keys, with the same kind of value', () => {
  assert.deepEqual(Object.keys(cs).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en)) assert.equal(typeof cs[k], typeof en[k], k);
});

test('placeholders used in English also appear in Czech', () => {
  const vars = (s) => (typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort() : []);
  for (const k of Object.keys(en)) assert.deepEqual(vars(cs[k]), vars(en[k]), k);
});

test('t fills placeholders and switches language', () => {
  assert.equal(t('brief.title', { id: 2, name: 'Pinpoint' }), 'Mission 2: Pinpoint');
  setLanguage('cs');
  assert.equal(getLanguage(), 'cs');
  assert.equal(t('btn.play'), 'Hrát');
  assert.equal(t('brief.title', { id: 2, name: 'X' }), 'Mise 2: X');
});

test('unknown keys and languages fall back safely', () => {
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('xx');
  assert.equal(getLanguage(), 'en');
});

test('Czech plural forms: 1 / 2-4 / 5+', () => {
  setLanguage('cs');
  assert.match(t('loading.tiles', { n: 1 }), /1 dílek/);
  assert.match(t('loading.tiles', { n: 3 }), /3 dílky/);
  assert.match(t('loading.tiles', { n: 12 }), /12 dílků/);
  setLanguage('en');
  assert.match(t('loading.tiles', { n: 1 }), /1 tile to go/);
  assert.match(t('loading.tiles', { n: 5 }), /5 tiles to go/);
});

test('browser language detection', () => {
  assert.equal(detectLanguage(['cs-CZ', 'en']), 'cs');
  assert.equal(detectLanguage(['de-DE', 'cs']), 'cs');
  assert.equal(detectLanguage(['en-GB']), 'en');
  assert.equal(detectLanguage([]), 'en');
  assert.equal(detectLanguage(undefined), 'en');
  assert.deepEqual(Object.keys(LANGS), ['en', 'cs']);
});

test('language change notifies listeners', () => {
  const seen = [];
  const off = onLanguageChange((l) => seen.push(l));
  setLanguage('cs');
  off();
  setLanguage('en');
  assert.deepEqual(seen, ['cs']);
});

test('every help text key exists in the dictionaries', () => {
  const keys = [
    ...CONTROL_GROUPS.flatMap((g) => [g.title, ...g.rows.flatMap((r) => [r.action, ...r.keys.filter((k) => k.startsWith('key.')), ...(r.pad.startsWith('pad.') ? [r.pad] : [])])]),
    ...TIPS, ...HUD_GUIDE.flat(),
  ];
  for (const k of keys) assert.ok(k in en, k);
});
