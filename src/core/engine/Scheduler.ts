import type { TransportState } from '../types/transport';

export interface Scheduler {
  play(): void;
  pause(): void;
  stop(): void;
  setBpm(bpm: number): void;
  getState(): TransportState;
}
