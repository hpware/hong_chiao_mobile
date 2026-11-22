import UPNG from 'upng-js';

import { CAPTCHA_TEMPLATES } from './captcha-templates';

/**
 * On-device reader for the YB2K portal captcha.
 *
 * The portal draws five italic digits at fixed positions in a 68×22 image, tinted blue→purple
 * over grey line noise and scattered dots. We keep only the tinted "ink" pixels, cut out the five
 * glyph slots and compare each against labelled glyphs (nearest neighbour, allowing a little
 * jitter). The templates come from captchas the portal itself confirmed, see
 * `captcha-templates.ts`.
 */

const SLOT_X = 12; // left edge of the first glyph slot
const PITCH = 7; // distance between glyph slots
const SLOT_Y = 4;
const GLYPH_W = 10;
const GLYPH_H = 12;
const DIGITS = 5;

type Template = { digit: string; bits: Uint8Array };

let templates: Template[] | null = null;

function loadTemplates() {
  if (templates) return templates;
  templates = [];
  for (const [digit, list] of Object.entries(CAPTCHA_TEMPLATES)) {
    for (const hex of list) {
      const bits = new Uint8Array(GLYPH_W * GLYPH_H);
      for (let i = 0; i < hex.length; i++) {
        const nibble = parseInt(hex[i], 16);
        for (let b = 0; b < 4; b++) bits[i * 4 + b] = (nibble >> (3 - b)) & 1;
      }
      templates.push({ digit, bits });
    }
  }
  return templates;
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Reads the digits from a captcha `data:` URI. Returns `null` if the image isn't the expected kind. */
export function readCaptcha(dataUri: string): string | null {
  const comma = dataUri.indexOf(',');
  if (comma < 0) return null;
  let image: UPNG.Image;
  try {
    image = UPNG.decode(base64ToBytes(dataUri.slice(comma + 1)).buffer);
  } catch {
    return null; // not a PNG
  }
  const { width, height } = image;
  if (width < SLOT_X + PITCH * DIGITS || height < SLOT_Y + GLYPH_H) return null;
  const rgba = new Uint8Array(UPNG.toRGBA8(image)[0]);

  // Ink = the tinted digit strokes: low green, clearly more blue than green. Grey noise has b ≈ g.
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    ink[i] = g < 110 && b - g > 40 ? 1 : 0;
  }

  const glyphs = loadTemplates();
  let text = '';
  for (let slot = 0; slot < DIGITS; slot++) {
    let bestDistance = Infinity;
    let bestDigit = '';
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x0 = SLOT_X + PITCH * slot + dx;
        const y0 = SLOT_Y + dy;
        for (const t of glyphs) {
          let distance = 0;
          for (let y = 0; y < GLYPH_H && distance < bestDistance; y++) {
            const yy = y0 + y;
            for (let x = 0; x < GLYPH_W; x++) {
              const xx = x0 + x;
              const v = xx >= 0 && xx < width && yy >= 0 && yy < height ? ink[yy * width + xx] : 0;
              if (v !== t.bits[y * GLYPH_W + x]) distance++;
            }
          }
          if (distance < bestDistance) {
            bestDistance = distance;
            bestDigit = t.digit;
          }
        }
      }
    }
    text += bestDigit;
  }
  return text.length === DIGITS ? text : null;
}
