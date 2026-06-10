import type { HSL, OKLCH, RGB } from "./types.js";

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

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb01(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

interface OKLab {
  L: number;
  a: number;
  b: number;
}

function linearRgbToOklab(r: number, g: number, b: number): OKLab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

interface LinearRGB {
  r: number;
  g: number;
  b: number;
}

function oklabToLinearRgb(L: number, a: number, b: number): LinearRGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function rgbToOklch(r: number, g: number, b: number): OKLCH {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const lab = linearRgbToOklab(lr, lg, lb);
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

function isInGamut(linear: LinearRGB, eps = 1e-4): boolean {
  return (
    linear.r >= -eps &&
    linear.r <= 1 + eps &&
    linear.g >= -eps &&
    linear.g <= 1 + eps &&
    linear.b >= -eps &&
    linear.b <= 1 + eps
  );
}

function oklchToLinearRgb(L: number, C: number, h: number): LinearRGB {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  return oklabToLinearRgb(L, a, b);
}

/**
 * Convert OKLCH to sRGB (0..255 ints).
 * If the requested color is outside sRGB gamut, reduce chroma toward 0
 * while keeping L and h, then clip residual rounding noise.
 * Follows CSS Color Level 4 gamut-mapping intent (preserve perceived
 * lightness; sacrifice some saturation).
 */
export function oklchToRgb(L: number, C: number, h: number): RGB {
  const direct = oklchToLinearRgb(L, C, h);
  let lin = direct;

  if (!isInGamut(direct)) {
    let lo = 0;
    let hi = C;
    for (let iter = 0; iter < 15; iter++) {
      const mid = (lo + hi) / 2;
      const test = oklchToLinearRgb(L, mid, h);
      if (isInGamut(test)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    lin = oklchToLinearRgb(L, lo, h);
  }

  const sr = linearToSrgb01(lin.r) * 255;
  const sg = linearToSrgb01(lin.g) * 255;
  const sb = linearToSrgb01(lin.b) * 255;
  return {
    r: Math.max(0, Math.min(255, Math.round(sr))),
    g: Math.max(0, Math.min(255, Math.round(sg))),
    b: Math.max(0, Math.min(255, Math.round(sb))),
  };
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function shortestHueDelta(from: number, to: number): number {
  let d = ((((to - from) % 360) + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}
