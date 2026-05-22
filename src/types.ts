export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface OKLCH {
  L: number;
  C: number;
  h: number;
}

export type ColorMap = Record<string, string>;

export interface PreparsedMap {
  sourcesRgb: RGB[];
  targetsRgb: RGB[];
  sourcesOklch: OKLCH[];
  targetsOklch: OKLCH[];
  hueDeltas: number[];
  originalKeys: string[];
}

export interface ProcessOptions {
  hueRadius?: number;
  chromaThreshold?: number;
  preserveNeutrals?: boolean;
  verbose?: boolean;
}

export interface ProcessResult {
  inputPath: string;
  outputPath: string;
  width: number;
  height: number;
  pixelsTotal: number;
  pixelsAffected: number;
  pixelsSkippedTransparent: number;
  pixelsSkippedNeutral: number;
  pixelsSkippedFar: number;
  hitsBySource: Record<string, number>;
}

export const DEFAULT_HUE_RADIUS = 30;
export const DEFAULT_CHROMA_THRESHOLD = 0.04;
