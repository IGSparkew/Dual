import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/PanelRegistry';

export function EffectsPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="⋱"
      label="FX Rack"
      description="Effects chain — Phase 4"
    />
  );
}
