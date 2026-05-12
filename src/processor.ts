import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { hslToRgb, rgbToHsl } from "./color.js";
import { findNearestByHue } from "./mapper.js";
import {
  DEFAULT_HUE_RADIUS,
  DEFAULT_SATURATION_THRESHOLD,
  type PreparsedMap,
  type ProcessOptions,
  type ProcessResult,
} from "./types.js";

const PNG_EXT = new Set([".png"]);
const JPG_EXT = new Set([".jpg", ".jpeg"]);

export async function processFile(
  inputPath: string,
  outputPath: string,
  map: PreparsedMap,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const outExt = path.extname(outputPath).toLowerCase();
  if (!PNG_EXT.has(outExt) && !JPG_EXT.has(outExt)) {
    throw new Error(
      `Unsupported output format: "${outExt}". Use .png, .jpg, or .jpeg`,
    );
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(
      `Expected 4 channels (RGBA) after ensureAlpha(), got ${channels}`,
    );
  }

  const hueRadius = opts.hueRadius ?? DEFAULT_HUE_RADIUS;
  if (!Number.isFinite(hueRadius) || hueRadius <= 0 || hueRadius > 180) {
    throw new Error(
      `hueRadius must be in (0, 180], got ${hueRadius}`,
    );
  }
  const satThreshold =
    opts.saturationThreshold ?? DEFAULT_SATURATION_THRESHOLD;
  if (!Number.isFinite(satThreshold) || satThreshold < 0 || satThreshold > 1) {
    throw new Error(
      `saturationThreshold must be in [0, 1], got ${satThreshold}`,
    );
  }
  const preserveNeutrals = opts.preserveNeutrals !== false;

  const hitsBySource: Record<string, number> = {};
  for (const key of map.originalKeys) hitsBySource[key] = 0;

  const total = width * height;
  let pixelsAffected = 0;
  let pixelsSkippedTransparent = 0;
  let pixelsSkippedNeutral = 0;
  let pixelsSkippedFar = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) {
      pixelsSkippedTransparent++;
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const hsl = rgbToHsl(r, g, b);

    if (preserveNeutrals && hsl.s < satThreshold) {
      pixelsSkippedNeutral++;
      continue;
    }

    const { index, hueDist } = findNearestByHue(hsl.h, map.sourcesHsl);
    if (hueDist >= hueRadius) {
      pixelsSkippedFar++;
      continue;
    }

    const t = hueDist / hueRadius;
    const w = 1 - t * t * (3 - 2 * t);

    const newH = hsl.h + map.hueDeltas[index];
    const replaced = hslToRgb(newH, hsl.s, hsl.l);

    data[i] = Math.round(r * (1 - w) + replaced.r * w);
    data[i + 1] = Math.round(g * (1 - w) + replaced.g * w);
    data[i + 2] = Math.round(b * (1 - w) + replaced.b * w);

    pixelsAffected++;
    hitsBySource[map.originalKeys[index]]++;
  }

  const pipeline = sharp(data, {
    raw: { width, height, channels: 4 },
  });

  if (PNG_EXT.has(outExt)) {
    await pipeline.png().toFile(outputPath);
  } else {
    await pipeline.jpeg().toFile(outputPath);
  }

  return {
    inputPath,
    outputPath,
    width,
    height,
    pixelsTotal: total,
    pixelsAffected,
    pixelsSkippedTransparent,
    pixelsSkippedNeutral,
    pixelsSkippedFar,
    hitsBySource,
  };
}
