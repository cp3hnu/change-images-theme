import { promises as fs } from "node:fs";
import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export interface ImageEntry {
  inputPath: string;
  outputPath: string;
  relativePath: string;
}

export interface ListImagesOptions {
  recursive: boolean;
}

export async function listImages(
  inputDir: string,
  outputDir: string,
  opts: ListImagesOptions,
): Promise<ImageEntry[]> {
  const results: ImageEntry[] = [];

  async function walk(currentDir: string): Promise<void> {
    const dirents = await fs.readdir(currentDir, { withFileTypes: true });
    for (const dirent of dirents) {
      const full = path.join(currentDir, dirent.name);
      if (dirent.isDirectory()) {
        if (opts.recursive) await walk(full);
        continue;
      }
      if (!dirent.isFile()) continue;
      if (!isImageFile(dirent.name)) continue;

      const relativePath = path.relative(inputDir, full);
      results.push({
        inputPath: full,
        outputPath: path.join(outputDir, relativePath),
        relativePath,
      });
    }
  }

  await walk(inputDir);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}
