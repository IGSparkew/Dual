export interface Clip {
  id: string;
  name: string;
  code: string;
  trackId: string;
  color?: string;
  isPlaying: boolean;
  isMuted: boolean;
}

export interface Track {
  id: string;
  name: string;
  clips: Clip[];
}
