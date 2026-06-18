export interface Clip {
  id: string;
  name: string;
  code: string;
  trackId: string;
  color?: string;
}

export interface Track {
  id: string;
  name: string;
  clips: Clip[];
}
