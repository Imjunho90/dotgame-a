// Shell layer: renders text with the system monospace font into an offscreen canvas,
// keeps only pixels whose alpha >= ALPHA_THRESHOLD, and paints them in a palette colour.
import { CONSTANTS, alphaMask } from './logic.js';

const TEXT_PX = 12;
const MASK_HEIGHT = 16;
const BASELINE = 12;
const cache = new Map();

function buildMask(text) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `${TEXT_PX}px monospace`;
  const width = Math.ceil(probe.measureText(text).width) + 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = MASK_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = `${TEXT_PX}px monospace`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 0, BASELINE);
  const rgba = ctx.getImageData(0, 0, width, MASK_HEIGHT).data;
  const alpha = new Uint8Array(width * MASK_HEIGHT);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { width, mask: alphaMask(alpha, CONSTANTS.ALPHA_THRESHOLD) };
}

function getMask(text) {
  if (!cache.has(text)) cache.set(text, buildMask(text));
  return cache.get(text);
}

/** align: 'left' (x = left edge), 'right' (x = right edge), 'center' (x = centre). baseline is in canvas pixels. */
export function drawText(ctx, text, x, baselineY, color, align = 'left') {
  const { width, mask } = getMask(text);
  const left = align === 'right' ? x - width : align === 'center' ? Math.round(x - width / 2) : x;
  const top = baselineY - BASELINE;
  ctx.fillStyle = color;
  for (let y = 0; y < MASK_HEIGHT; y++) {
    for (let px = 0; px < width; px++) {
      if (mask[y * width + px]) ctx.fillRect(left + px, top + y, 1, 1);
    }
  }
}
