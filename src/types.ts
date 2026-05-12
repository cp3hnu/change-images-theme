export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export type ColorMap = Record<string, string>;

export interface PreparsedMap {
  sourcesRgb: RGB[];
  targetsRgb: RGB[];
  sourcesHsl: HSL[];
  targetsHsl: HSL[];
  hueDeltas: number[];
  originalKeys: string[];
}

export interface ProcessOptions {
  hueRadius?: number;
  saturationThreshold?: number;
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
export const DEFAULT_SATURATION_THRESHOLD = 0.1;
