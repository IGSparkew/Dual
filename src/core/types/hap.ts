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
