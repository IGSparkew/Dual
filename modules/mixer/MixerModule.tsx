import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/registry/PanelRegistry';

export function MixerModule(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="SlidersHorizontal"
      label="Mixer"
      description="Faders & VU meters — Phase 3"
    />
  );
}
