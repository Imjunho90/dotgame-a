// Usage: node tools/verify-path.mjs
// Reads GAME_DESIGN.md chapter 5, checks invariants, runs the (x,y,mask) BFS,
// and fails if the result differs from the value recorded in chapter 5.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RANGE_MAX_STEPS,
  RANGE_MIN_STEPS,
  checkInvariants,
  TOTAL_TICKS,
  enemyCycleTicks,
  extractGridBlock,
  humanWitness,
  parseGrid,
  patrolOf,
  replayWithEnemy,
  shortestRoute,
  shortestRouteWithEnemy,
} from './route.mjs';

const designPath = fileURLToPath(new URL('../GAME_DESIGN.md', import.meta.url));
const markdown = readFileSync(designPath, 'utf8');
const grid = parseGrid(extractGridBlock(markdown));

const problems = checkInvariants(grid);
const route = shortestRoute(grid);

console.log(`grid: ${grid.width}x${grid.height}, houses: ${grid.houses.length}`);
if (route) {
  console.log(`shortest steps: ${route.steps}`);
  console.log(`shortest seconds: ${route.seconds.toFixed(1)}`);
  for (const o of route.order) console.log(`  H${o.house} delivered at step ${o.step}`);
} else {
  console.log('shortest steps: unreachable');
}

const recSteps = markdown.match(/^- 측정 최단 칸수: (\d+)\s*$/m);
const recSeconds = markdown.match(/^- 측정 최단 시간\(초\): ([\d.]+)\s*$/m);
if (!recSteps || !recSeconds) problems.push('chapter 5 recorded values not found');
if (route && recSteps && Number(recSteps[1]) !== route.steps) {
  problems.push(`recorded steps ${recSteps[1]} != computed ${route.steps}`);
}
if (route && recSeconds && Number(recSeconds[1]).toFixed(1) !== route.seconds.toFixed(1)) {
  problems.push(`recorded seconds ${recSeconds[1]} != computed ${route.seconds.toFixed(1)}`);
}
if (route && (route.steps < RANGE_MIN_STEPS || route.steps > RANGE_MAX_STEPS)) {
  problems.push(`steps ${route.steps} outside ${RANGE_MIN_STEPS}..${RANGE_MAX_STEPS}`);
}

// 5장-2: enemy-inclusive measurements.
const patrol = patrolOf(grid);
const withEnemy = shortestRouteWithEnemy(grid);
const witness = replayWithEnemy(grid, humanWitness(grid, 962));
const late = replayWithEnemy(grid, humanWitness(grid, 962 + enemyCycleTicks(patrol.length)));
let firstExposure = null;
{
  let x = grid.start.x;
  let y = grid.start.y;
  const on = (px, py) => patrol.some((p) => p.x === px && p.y === py);
  route.moves.some((m, k) => {
    x += m === 'right' ? 1 : m === 'left' ? -1 : 0;
    y += m === 'down' ? 1 : m === 'up' ? -1 : 0;
    if (on(x, y)) firstExposure = 1 + 10 * k;
    return firstExposure !== null;
  });
}
const measured = {
  '적 포함 최소 승리 틱': withEnemy?.tick,
  '사람용 증인 승리 틱': witness.status === 'win' ? witness.tick : null,
  '위상 최악 상한(틱)': late.status === 'win' ? late.tick : null,
  '최초 노출 틱': firstExposure,
};
for (const [label, value] of Object.entries(measured)) {
  console.log(`${label}: ${value}`);
  const rec = markdown.match(new RegExp(`^- ${label.replace(/[()]/g, '\\$&')}: (\\d+)\\s*$`, 'm'));
  if (!rec) problems.push(`chapter 5-2 recorded "${label}" not found`);
  else if (Number(rec[1]) !== value) problems.push(`recorded ${label} ${rec[1]} != computed ${value}`);
  if (value === null || value === undefined || value >= TOTAL_TICKS) problems.push(`${label} missing or beyond ${TOTAL_TICKS - 1} ticks`);
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL: ${p}`);
  process.exit(1);
}
console.log('OK: invariants pass, recorded value matches, within range');
