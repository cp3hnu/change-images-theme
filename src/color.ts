import type { HSL, RGB } from "./types.js";

const HEX_SHORT = /^#?([0-9a-fA-F]{3})$/;
const HEX_LONG = /^#?([0-9a-fA-F]{6})$/;

export function hexToRgb(hex: string): RGB {
  const trimmed = hex.trim();
  const long = HEX_LONG.exec(trimmed);
  if (long) {
    const v = long[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
    };
  }
  const short = HEX_SHORT.exec(trimmed);
  if (short) {
    const v = short[1];
    const r = parseInt(v[0] + v[0], 16);
    const g = parseInt(v[1] + v[1], 16);
    const b = parseInt(v[2] + v[2], 16);
    return { r, g, b };
  }
  throw new Error(`Invalid hex color: ${hex}`);
}

export function rgbToHex(rgb: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toHex = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function isValidHex(hex: string): boolean {
  return HEX_SHORT.test(hex.trim()) || HEX_LONG.test(hex.trim());
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r1) {
    h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60;
  } else if (max === g1) {
    h = ((b1 - r1) / d + 2) * 60;
  } else {
    h = ((r1 - g1) / d + 4) * 60;
  }
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const h1 = (((h % 360) + 360) % 360) / 360;
  return {
    r: Math.round(hue2rgb(p, q, h1 + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h1) * 255),
    b: Math.round(hue2rgb(p, q, h1 - 1 / 3) * 255),
  };
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function shortestHueDelta(from: number, to: number): number {
  let d = ((to - from) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** CSS filter hue-rotate: rotates hue while preserving perceptual luminance. */
export function hueRotateRgb(r: number, g: number, b: number, degrees: number): RGB {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;

  const nr =
    r1 * (0.213 + cos * 0.787 - sin * 0.213) +
    g1 * (0.715 - cos * 0.715 - sin * 0.715) +
    b1 * (0.072 - cos * 0.072 + sin * 0.928);

  const ng =
    r1 * (0.213 - cos * 0.213 + sin * 0.143) +
    g1 * (0.715 + cos * 0.285 + sin * 0.140) +
    b1 * (0.072 - cos * 0.072 - sin * 0.283);

  const nb =
    r1 * (0.213 - cos * 0.213 - sin * 0.787) +
    g1 * (0.715 - cos * 0.715 + sin * 0.715) +
    b1 * (0.072 + cos * 0.928 + sin * 0.072);

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return { r: clamp(nr), g: clamp(ng), b: clamp(nb) };
}
