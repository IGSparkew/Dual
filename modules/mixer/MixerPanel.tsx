import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/registry/PanelRegistry';

export function MixerPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="âŠŸ"
      label="Mixer"
      description="Faders & VU meters â€” Phase 3"
    />
  );
}
