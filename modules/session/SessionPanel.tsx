import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/registry/PanelRegistry';

export function SessionPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="â–¦"
      label="Session View"
      description="Clip grid â€” Phase 1"
    />
  );
}
