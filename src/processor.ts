import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { oklchToRgb, rgbToOklch } from "./color.js";
import { findNearestByHue } from "./mapper.js";
import {
  DEFAULT_CHROMA_THRESHOLD,
  DEFAULT_HUE_RADIUS,
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
    throw new Error(`hueRadius must be in (0, 180], got ${hueRadius}`);
  }
  const chromaThreshold = opts.chromaThreshold ?? DEFAULT_CHROMA_THRESHOLD;
  if (
    !Number.isFinite(chromaThreshold) ||
    chromaThreshold < 0 ||
    chromaThreshold > 0.5
  ) {
    throw new Error(
      `chromaThreshold must be in [0, 0.5], got ${chromaThreshold}`,
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

    const lch = rgbToOklch(r, g, b);

    if (preserveNeutrals && lch.C < chromaThreshold) {
      pixelsSkippedNeutral++;
      continue;
    }

    const { index, hueDist } = findNearestByHue(lch.h, map.sourcesOklch);
    if (hueDist >= hueRadius) {
      pixelsSkippedFar++;
      continue;
    }

    const t = hueDist / hueRadius;
    const w = 1 - t * t * (3 - 2 * t);

    const newH = lch.h + map.hueDeltas[index];
    const replaced = oklchToRgb(lch.L, lch.C, newH);

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
