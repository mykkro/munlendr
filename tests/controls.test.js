import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_GROUPS, TIPS, HUD_GUIDE } from '../src/ui/controls.js';
import { GAME_CODES } from '../src/game/input.js';

const allRows = () => CONTROL_GROUPS.flatMap((g) => g.rows);

test('every key the game listens to is explained in the help', () => {
  const documented = new Set(allRows().flatMap((r) => r.codes ?? []));
  for (const code of GAME_CODES) assert.ok(documented.has(code), `${code} is not in the help`);
});

test('help rows are complete: keys, a gamepad column and a description', () => {
  for (const r of allRows()) {
    assert.ok(r.keys.length > 0 && r.action, JSON.stringify(r));
    assert.ok(typeof r.pad === 'string', JSON.stringify(r));
  }
  assert.ok(CONTROL_GROUPS.length >= 4);
  assert.ok(TIPS.length >= 3);
  assert.ok(HUD_GUIDE.length >= 4);
});
