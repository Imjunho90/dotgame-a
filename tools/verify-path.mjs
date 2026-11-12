// Usage: node tools/verify-path.mjs
// Reads GAME_DESIGN.md chapter 5, checks invariants, runs the (x,y,mask) BFS,
// and fails if the result differs from the value recorded in chapter 5.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RANGE_MAX_STEPS,
  RANGE_MIN_STEPS,
  checkInvariants,
  extractGridBlock,
  parseGrid,
  shortestRoute,
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

if (problems.length) {
  for (const p of problems) console.error(`FAIL: ${p}`);
  process.exit(1);
}
console.log('OK: invariants pass, recorded value matches, within range');
