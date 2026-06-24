import type { RawClip } from '../session-model';

export interface SessionGridProps {
  clips: RawClip[];
  labels: Record<string, string>;
  playing: string[];
  selection: string[];
  focused: string | null;
  launchEnabled: boolean;
  onSelect: (clip: RawClip, additive: boolean) => void;
  onLaunch: (clip: RawClip) => void;
  onRename: (clip: RawClip, label: string) => void;
}
