import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/registry/PanelRegistry';

export function EffectsModule(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="Sliders"
      label="FX Rack"
      description="Effects chain — Phase 4"
    />
  );
}
