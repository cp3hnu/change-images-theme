import {
  hexToRgb,
  hueDistance,
  isValidHex,
  rgbToHsl,
  rgbToOklch,
  shortestHueDelta,
} from "./color.js";
import type { ColorMap, PreparsedMap } from "./types.js";

export function parseColorMap(map: ColorMap): PreparsedMap {
  const entries = Object.entries(map);
  if (entries.length === 0) {
    throw new Error("Color map is empty");
  }

  const sourcesRgb: PreparsedMap["sourcesRgb"] = [];
  const targetsRgb: PreparsedMap["targetsRgb"] = [];
  const sourcesHsl: PreparsedMap["sourcesHsl"] = [];
  const targetsHsl: PreparsedMap["targetsHsl"] = [];
  const sourcesOklch: PreparsedMap["sourcesOklch"] = [];
  const targetsOklch: PreparsedMap["targetsOklch"] = [];
  const hueDeltas: number[] = [];
  const originalKeys: string[] = [];

  for (const [src, tgt] of entries) {
    if (!isValidHex(src)) {
      throw new Error(`Invalid source hex in map: "${src}"`);
    }
    if (typeof tgt !== "string" || !isValidHex(tgt)) {
      throw new Error(`Invalid target hex in map for key "${src}": "${tgt}"`);
    }
    const sRgb = hexToRgb(src);
    const tRgb = hexToRgb(tgt);
    const sHsl = rgbToHsl(sRgb.r, sRgb.g, sRgb.b);
    const tHsl = rgbToHsl(tRgb.r, tRgb.g, tRgb.b);
    const sLch = rgbToOklch(sRgb.r, sRgb.g, sRgb.b);
    const tLch = rgbToOklch(tRgb.r, tRgb.g, tRgb.b);
    sourcesRgb.push(sRgb);
    targetsRgb.push(tRgb);
    sourcesHsl.push(sHsl);
    targetsHsl.push(tHsl);
    sourcesOklch.push(sLch);
    targetsOklch.push(tLch);
    hueDeltas.push(shortestHueDelta(sLch.h, tLch.h));
    originalKeys.push(src);
  }

  return {
    sourcesRgb,
    targetsRgb,
    sourcesHsl,
    targetsHsl,
    sourcesOklch,
    targetsOklch,
    hueDeltas,
    originalKeys,
  };
}

export interface NearestHueResult {
  index: number;
  hueDist: number;
}

export function findNearestByHue(
  pixelHue: number,
  sources: PreparsedMap["sourcesHsl"],
): NearestHueResult {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < sources.length; i++) {
    const d = hueDistance(pixelHue, sources[i].h);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
      if (d === 0) break;
    }
  }
  return { index: bestIdx, hueDist: bestDist };
}
