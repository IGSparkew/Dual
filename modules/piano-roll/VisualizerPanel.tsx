import { PlaceholderPanel } from '@ui/shared/PlaceholderPanel';
import type { PanelProps } from '@layout/PanelRegistry';

export function VisualizerPanel(_: PanelProps) {
  return (
    <PlaceholderPanel
      icon="♪"
      label="Visualizer"
      description="Piano Roll / Drum Grid — Phase 2"
    />
  );
}
