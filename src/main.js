// Shell: DOM events, requestAnimationFrame loop, Canvas 2D rendering. No game rules live here.
import {
  CONSTANTS,
  applyRestart,
  applyStart,
  createInitialState,
  displaySeconds,
  parseLevel,
  pressKey,
  releaseAllKeys,
  releaseKey,
  skyStage,
  stepAccumulator,
  sunX,
  tick,
} from './logic.js';
import { LEVEL_ROWS } from './levels.js';
import { PALETTE, SPRITES } from './sprites.js';
import { STRINGS } from './strings.js';
import { drawText } from './text.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const TILE = CONSTANTS.TILE_PX;
const MAP_Y = 32;
const HUD_Y = 224;

let state = createInitialState(parseLevel(LEVEL_ROWS));

const KEY_DIRECTION = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
const START_KEYS = new Set(['Space', 'Enter']);
const SKY_COLOR = { day: 1, sunset: 2, night: 0 };

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRECTION[e.code];
  if (dir) {
    e.preventDefault();
    if (!e.repeat) state = pressKey(state, dir);
  } else if (START_KEYS.has(e.code)) {
    e.preventDefault();
    state = applyStart(state);
  } else if (e.code === 'KeyR') {
    state = applyRestart(state);
  }
});

window.addEventListener('keyup', (e) => {
  const dir = KEY_DIRECTION[e.code];
  if (dir) {
    e.preventDefault();
    state = releaseKey(state, dir);
  }
});

window.addEventListener('blur', () => {
  state = releaseAllKeys(state);
});

function drawSprite(sprite, x, y) {
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const idx = sprite[row][col];
      if (idx < 0) continue;
      ctx.fillStyle = PALETTE[idx];
      ctx.fillRect(x + col, y + row, 1, 1);
    }
  }
}

function drawMessageBox(lines) {
  ctx.fillStyle = PALETTE[0];
  ctx.fillRect(48, 112, 160, 32);
  ctx.fillStyle = PALETTE[7];
  ctx.fillRect(48, 112, 160, 1);
  ctx.fillRect(48, 143, 160, 1);
  ctx.fillRect(48, 112, 1, 32);
  ctx.fillRect(207, 112, 1, 32);
  if (lines.length === 1) {
    drawText(ctx, lines[0], 128, 134, PALETTE[7], 'center');
  } else {
    drawText(ctx, lines[0], 128, 127, PALETTE[7], 'center');
    drawText(ctx, lines[1], 128, 141, PALETTE[7], 'center');
  }
}

function render() {
  // Sky band: colour from skyStage, sun moves left to right at y = 8 (GAME_DESIGN.md 6장, 7장 규칙 9).
  ctx.fillStyle = PALETTE[SKY_COLOR[skyStage(state.remainingMs)]];
  ctx.fillRect(0, 0, 256, 32);
  drawSprite(SPRITES.sun, sunX(state.remainingMs), 8);
  ctx.fillStyle = PALETTE[5];
  ctx.fillRect(0, 31, 256, 1);

  const { level } = state;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const c = level.rows[y][x];
      const tile = c === '#' ? SPRITES.wall : SPRITES.floor;
      drawSprite(tile, x * TILE, MAP_Y + y * TILE);
    }
  }
  level.houses.forEach((h) => drawSprite(SPRITES.house, h.x * TILE, MAP_Y + h.y * TILE));
  drawSprite(SPRITES.snail, state.snail.x * TILE, MAP_Y + state.snail.y * TILE);

  ctx.fillStyle = PALETTE[0];
  ctx.fillRect(0, HUD_Y, 256, 16);
  drawText(ctx, `${STRINGS.HUD_TIME} ${displaySeconds(state.remainingMs)}`, 4, 236, PALETTE[7], 'left');
  drawText(ctx, `${STRINGS.HUD_LETTERS} ${state.lettersRemaining}`, 252, 236, PALETTE[7], 'right');

  if (state.status === 'ready') drawMessageBox([STRINGS.START_PROMPT]);
  if (state.status === 'win') drawMessageBox([STRINGS.WIN, STRINGS.RESTART_HINT]);
  if (state.status === 'lose') drawMessageBox([STRINGS.LOSE, STRINGS.RESTART_HINT]);
}

let accMs = 0;
let last = null;
function frame(now) {
  if (last !== null) {
    const r = stepAccumulator(accMs, now - last);
    accMs = r.accMs;
    for (let i = 0; i < r.ticks; i++) state = tick(state);
  }
  last = now;
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A9 verification hook (GAME_DESIGN.md 9장): unique canvas colours as '#rrggbb', sorted.
// Every entry must be in the 6장 palette; the console line lists any that are not.
window.__paletteAudit = () => {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) {
    const hex = '#' + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    seen.add(hex);
  }
  const colors = [...seen].sort();
  const outside = colors.filter((c) => !PALETTE.includes(c));
  console.log(`paletteAudit: ${colors.length} colours, outside palette: ${JSON.stringify(outside)}`);
  return colors;
};
