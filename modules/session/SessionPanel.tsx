import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/PanelRegistry';

export function SessionPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="▦"
      label="Session View"
      description="Clip grid — Phase 1"
    />
  );
}
