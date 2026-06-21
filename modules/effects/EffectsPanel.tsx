import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/registry/PanelRegistry';

export function EffectsPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="â‹±"
      label="FX Rack"
      description="Effects chain â€” Phase 4"
    />
  );
}
