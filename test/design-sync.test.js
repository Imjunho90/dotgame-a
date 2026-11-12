import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractGridBlock } from '../tools/route.mjs';
import { CONSTANTS } from '../src/logic.js';
import { LEVEL_ROWS } from '../src/levels.js';
import { PALETTE, SPRITES } from '../src/sprites.js';
import { STRINGS } from '../src/strings.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const design = read('../GAME_DESIGN.md');

const section = (n) => {
  const start = design.indexOf(`## ${n}장`);
  assert.ok(start >= 0, `chapter ${n} missing`);
  const next = design.indexOf('\n## ', start + 1);
  return design.slice(start, next < 0 ? undefined : next);
};

test('chapter 5 grid == src/levels.js, verbatim', () => {
  assert.deepEqual(LEVEL_ROWS, extractGridBlock(design));
});

test('chapter 6 palette == src/sprites.js palette', () => {
  const rows = [...section(6).matchAll(/^\| (\d) \| `(#[0-9a-f]{6})` \|/gm)];
  assert.equal(rows.length, 8);
  rows.forEach((m, i) => assert.equal(Number(m[1]), i));
  assert.deepEqual(PALETTE, rows.map((m) => m[2]));
});

test('every sprite cell is a palette index 0..7 or transparent', () => {
  for (const [name, sprite] of Object.entries(SPRITES)) {
    for (const row of sprite) {
      for (const idx of row) assert.ok(idx === -1 || (idx >= 0 && idx <= 7), `${name}: ${idx}`);
    }
  }
});

test('index.html only uses palette colours', () => {
  const html = read('../index.html');
  const hexes = html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.ok(hexes.length > 0);
  for (const h of hexes) assert.ok(PALETTE.includes(h.toLowerCase()), `${h} is not in the palette`);
});

test('chapter 7 numbers table == logic CONSTANTS (every key, both directions)', () => {
  const rows = [...section(7).matchAll(/^\| `([A-Z_]+)` \| (\d+) \|/gm)];
  const doc = Object.fromEntries(rows.map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(doc, { ...CONSTANTS });
});

test('chapter 8 string table == src/strings.js (keys and text)', () => {
  const rows = [...section(8).matchAll(/^\| `([A-Z_]+)` \| ([^|]+?) \|\s*$/gm)];
  const doc = Object.fromEntries(rows.map((m) => [m[1], m[2]]));
  assert.deepEqual(doc, { ...STRINGS });
});
