import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/PanelRegistry';

export function MixerPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="⊟"
      label="Mixer"
      description="Faders & VU meters — Phase 3"
    />
  );
}
