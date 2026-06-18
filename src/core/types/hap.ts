export interface TimeSpan {
  begin: number;
  end: number;
}

export interface Hap {
  whole: TimeSpan;
  part: TimeSpan;
  value: unknown;
  context?: Record<string, unknown>;
}

export interface NormalizedHap {
  begin: number;
  end: number;
  sample: string | null;
  note: string | number | null;
  gain: number;
  pan: number;
  locations: { start: number; end: number }[] | null;
}