import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/registry/PanelRegistry';

export function SessionPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="LayoutGrid"
      label="Session View"
      description="Clip grid — Phase 1"
    />
  );
}
