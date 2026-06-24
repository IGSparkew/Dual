import type { RawClip } from '../session-model';

export interface ClipCellProps {
  clip: RawClip;
  label: string;
  isPlaying: boolean;
  isSelected: boolean;
  isFocused: boolean;
  launchEnabled: boolean;
  onSelect: (additive: boolean) => void;
  onLaunch: () => void;
  onRename: (label: string) => void;
}
