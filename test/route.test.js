import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  checkInvariants,
  extractGridBlock,
  parseGrid,
  shortestRoute,
} from '../tools/route.mjs';

const designText = readFileSync(fileURLToPath(new URL('../GAME_DESIGN.md', import.meta.url)), 'utf8');
const realRows = extractGridBlock(designText);

// Expected values below are hand-computed on paper (see comments), not taken from the solver.

test('fixture: single house at the end of a straight corridor', () => {
  // S at (1,1); H at (5,1); the nearest delivering tile is (4,1): 3 steps.
  const grid = parseGrid(['#######', '#S...H#', '#######']);
  const r = shortestRoute(grid);
  assert.equal(r.steps, 3);
  assert.equal(r.seconds, 1.5);
});

test('fixture: forced backtrack, both ends must be visited', () => {
  // S (2,1). H1 (1,0) needs tile (1,1); H2 (5,0) needs tile (5,1).
  // Left first: 1 + 4 = 5. Right first: 3 + 4 = 7. Minimum 5.
  const grid = parseGrid(['#H###H#', '#.S...#', '#######']);
  const r = shortestRoute(grid);
  assert.equal(r.steps, 5);
  assert.deepEqual(r.order, [
    { house: 1, step: 1 },
    { house: 2, step: 5 },
  ]);
});

test('fixture: one tile adjacent to two houses delivers both at once', () => {
  // S (2,1); tile (1,1) touches H (1,0) and H (1,2): one step delivers both.
  const grid = parseGrid(['#H###', '#.S.#', '#H###', '#####']);
  const r = shortestRoute(grid);
  assert.equal(r.steps, 1);
  assert.deepEqual(r.order, [
    { house: 1, step: 1 },
    { house: 2, step: 1 },
  ]);
});

test('fixture: house walled off from S is unreachable', () => {
  const grid = parseGrid(['#######', '#S.#.H#', '#######']);
  assert.equal(shortestRoute(grid), null);
});

test('fixture: house tiles block movement', () => {
  // The corridor is closed by an H at (3,1); the far side cannot be reached,
  // so the H at (5,1) cannot be delivered.
  const grid = parseGrid(['#######', '#S.H.H#', '#######']);
  assert.equal(shortestRoute(grid), null);
});

test('GAME_DESIGN.md chapter 5 grid satisfies every invariant', () => {
  assert.deepEqual(checkInvariants(parseGrid(realRows)), []);
});

test('GAME_DESIGN.md chapter 5 grid shortest route is 80 steps = 40.0 s', () => {
  const r = shortestRoute(parseGrid(realRows));
  assert.equal(r.steps, 80);
  assert.equal(r.seconds, 40.0);
});

test('recorded chapter 5 values equal the solver output and sit in range', () => {
  const steps = Number(designText.match(/^- 측정 최단 칸수: (\d+)\s*$/m)[1]);
  const seconds = designText.match(/^- 측정 최단 시간\(초\): ([\d.]+)\s*$/m)[1];
  const r = shortestRoute(parseGrid(realRows));
  assert.equal(steps, r.steps);
  assert.equal(seconds, r.seconds.toFixed(1));
  assert.ok(steps >= 76 && steps <= 84);
});

test('invariant violations are detected', () => {
  const mutate = (fn) => {
    const rows = realRows.map((r) => r.split(''));
    fn(rows);
    return checkInvariants(parseGrid(rows.map((r) => r.join(''))));
  };
  assert.ok(mutate((r) => { r[0][5] = '.'; }).some((m) => m.includes('border')));
  assert.ok(mutate((r) => { r[2][1] = 'S'; }).some((m) => m.includes('S count')));
  assert.ok(mutate((r) => { r[1][1] = 'S'; r[6][1] = '.'; }).some((m) => m.includes('S is 4-adjacent')));
  assert.ok(mutate((r) => { r[5][1] = '#'; }).length > 0);
  assert.ok(mutate((r) => { r[2][1] = 'H'; }).some((m) => m.includes('H count')));
});
