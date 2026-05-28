export type PlaybackStatus = 'stopped' | 'playing' | 'paused';

export interface TransportState {
  status: PlaybackStatus;
  bpm: number;
  position: number;
}
