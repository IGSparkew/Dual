import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/registry/PanelRegistry';

export function VisualizerModule(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="Music"
      label="Visualizer"
      description="Piano Roll / Drum Grid — Phase 2"
    />
  );
}
