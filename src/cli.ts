#!/usr/bin/env node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";

import { parseColorMap } from "./mapper.js";
import { processFile } from "./processor.js";
import { isImageFile, listImages } from "./walker.js";
import {
  DEFAULT_HUE_RADIUS,
  DEFAULT_SATURATION_THRESHOLD,
  type ColorMap,
  type PreparsedMap,
  type ProcessOptions,
  type ProcessResult,
} from "./types.js";

interface CliOptions {
  output: string;
  map: string;
  hueRadius?: string;
  saturationThreshold?: string;
  preserveNeutrals?: boolean;
  noRecursive?: boolean;
  recursive?: boolean;
  concurrency?: string;
  verbose?: boolean;
}

async function loadColorMap(mapArg: string): Promise<ColorMap> {
  const trimmed = mapArg.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as ColorMap;
    } catch (err) {
      throw new Error(
        `Failed to parse inline JSON map: ${(err as Error).message}`,
      );
    }
  }
  let raw: string;
  try {
    raw = await fs.readFile(trimmed, "utf8");
  } catch (err) {
    throw new Error(
      `Failed to read map file "${trimmed}": ${(err as Error).message}`,
    );
  }
  try {
    return JSON.parse(raw) as ColorMap;
  } catch (err) {
    throw new Error(
      `Failed to parse map file "${trimmed}" as JSON: ${(err as Error).message}`,
    );
  }
}

async function pathStatSafe(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

function formatSummary(r: ProcessResult): string {
  return (
    `affected ${r.pixelsAffected}/${r.pixelsTotal} ` +
    `(skipped: neutral=${r.pixelsSkippedNeutral}, ` +
    `far=${r.pixelsSkippedFar}, ` +
    `transparent=${r.pixelsSkippedTransparent})`
  );
}

async function runSingleFile(
  inputPath: string,
  outputPath: string,
  map: PreparsedMap,
  procOpts: ProcessOptions,
  verbose: boolean,
): Promise<void> {
  if (!isImageFile(inputPath)) {
    throw new Error(
      `Input file is not a supported image (.png/.jpg/.jpeg): ${inputPath}`,
    );
  }
  const result = await processFile(inputPath, outputPath, map, procOpts);
  console.log(
    `OK  ${inputPath} -> ${outputPath} ` +
      `(${result.width}x${result.height}, ${formatSummary(result)})`,
  );
  if (verbose) {
    for (const [src, count] of Object.entries(result.hitsBySource)) {
      console.log(`     ${src}: ${count} px`);
    }
  }
}

async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners: Promise<void>[] = [];
  const size = Math.max(1, Math.min(concurrency, items.length));
  for (let i = 0; i < size; i++) {
    runners.push(
      (async () => {
        while (true) {
          const idx = next++;
          if (idx >= items.length) return;
          results[idx] = await worker(items[idx], idx);
        }
      })(),
    );
  }
  await Promise.all(runners);
  return results;
}

async function runDirectory(
  inputDir: string,
  outputDir: string,
  map: PreparsedMap,
  procOpts: ProcessOptions,
  recursive: boolean,
  concurrency: number,
  verbose: boolean,
): Promise<void> {
  const outStat = await pathStatSafe(outputDir);
  if (outStat && !outStat.isDirectory()) {
    throw new Error(
      `Output path "${outputDir}" exists and is not a directory (required when input is a directory)`,
    );
  }
  await fs.mkdir(outputDir, { recursive: true });

  const entries = await listImages(inputDir, outputDir, { recursive });
  if (entries.length === 0) {
    console.log(
      `No images found in ${inputDir}${recursive ? " (recursive)" : ""}.`,
    );
    return;
  }

  console.log(
    `Found ${entries.length} image(s). Processing with concurrency=${concurrency}...`,
  );

  let succeeded = 0;
  let failed = 0;
  let nextIndex = 0;

  await runConcurrent(entries, concurrency, async (entry) => {
    const idx = ++nextIndex;
    const tag = `[${idx}/${entries.length}]`;
    try {
      const result = await processFile(
        entry.inputPath,
        entry.outputPath,
        map,
        procOpts,
      );
      succeeded++;
      console.log(`${tag} OK  ${entry.relativePath} (${formatSummary(result)})`);
      if (verbose) {
        for (const [src, count] of Object.entries(result.hitsBySource)) {
          console.log(`        ${src}: ${count} px`);
        }
      }
    } catch (err) {
      failed++;
      console.error(
        `${tag} ERR ${entry.relativePath}: ${(err as Error).message}`,
      );
    }
  });

  console.log(`Done. succeeded=${succeeded}, failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("change-image-theme")
    .description(
      "Apply a color theme to PNG/JPG images: match pixels by HSL hue, rotate in OKLCH for perceptual lightness/chroma preservation. " +
        "Low-saturation (neutral) and far-hue pixels are left unchanged.",
    )
    .argument("<input>", "input image file or directory")
    .requiredOption("-o, --output <path>", "output image file or directory")
    .requiredOption(
      "-m, --map <jsonOrPath>",
      'color mapping: path to a JSON file, or inline JSON like \'{"#514cf9":"#f05416"}\'',
    )
    .option(
      "-r, --hue-radius <degrees>",
      "HSL hue distance (0-180) within which a pixel is shifted toward the target hue (smoothstep falloff at the edge)",
      String(DEFAULT_HUE_RADIUS),
    )
    .option(
      "-t, --saturation-threshold <number>",
      "pixels with HSL saturation below this value (0-1) are treated as neutrals and preserved",
      String(DEFAULT_SATURATION_THRESHOLD),
    )
    .option(
      "--no-preserve-neutrals",
      "disable neutral preservation (also recolor low-saturation pixels)",
    )
    .option(
      "--no-recursive",
      "do not recurse into subdirectories when input is a directory",
    )
    .option(
      "-c, --concurrency <number>",
      "number of files to process in parallel (directory mode)",
      String(Math.max(1, os.cpus().length)),
    )
    .option("-v, --verbose", "print per-source pixel hit counts", false)
    .showHelpAfterError();

  program.parse(process.argv);
  const [input] = program.args as [string];
  const opts = program.opts<CliOptions>();

  const rawMap = await loadColorMap(opts.map);
  const map = parseColorMap(rawMap);

  const hueRadius = Number(opts.hueRadius);
  if (!Number.isFinite(hueRadius) || hueRadius <= 0 || hueRadius > 180) {
    throw new Error(
      `-r/--hue-radius must be in (0, 180], got: ${opts.hueRadius}`,
    );
  }

  const saturationThreshold = Number(opts.saturationThreshold);
  if (
    !Number.isFinite(saturationThreshold) ||
    saturationThreshold < 0 ||
    saturationThreshold > 1
  ) {
    throw new Error(
      `-t/--saturation-threshold must be in [0, 1], got: ${opts.saturationThreshold}`,
    );
  }

  const preserveNeutrals = opts.preserveNeutrals !== false;

  const concurrency = Math.max(1, Math.floor(Number(opts.concurrency ?? 1)));
  if (!Number.isFinite(concurrency)) {
    throw new Error(`--concurrency must be a positive integer`);
  }

  const verbose = Boolean(opts.verbose);
  const recursive = opts.recursive !== false;

  const procOpts: ProcessOptions = {
    hueRadius,
    saturationThreshold,
    preserveNeutrals,
    verbose,
  };

  const inputAbs = path.resolve(input);
  const outputAbs = path.resolve(opts.output);

  const inStat = await pathStatSafe(inputAbs);
  if (!inStat) {
    throw new Error(`Input path does not exist: ${input}`);
  }

  if (inStat.isFile()) {
    await runSingleFile(inputAbs, outputAbs, map, procOpts, verbose);
    return;
  }

  if (inStat.isDirectory()) {
    await runDirectory(
      inputAbs,
      outputAbs,
      map,
      procOpts,
      recursive,
      concurrency,
      verbose,
    );
    return;
  }

  throw new Error(`Input path is neither file nor directory: ${input}`);
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
