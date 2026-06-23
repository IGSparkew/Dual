import { Clip, Track } from "@core/types/clip";

export interface SessionGridProps {
  tracks: Track[];
  selectedClipId: string | null;
  onSelectClip: (clip: Clip) => void;
  onRenameClip: (clip: Clip, name: string) => void;
}