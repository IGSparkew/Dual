import { panelRegistry } from '@layout/registry/PanelRegistryImpl';
import type { SlotId, PanelCapability } from '@core/types/panel';
import manifest from './manifest.json';
import { VisualizerPanel } from './VisualizerPanel';

panelRegistry.register({
  ...manifest,
  defaultSlot: manifest.defaultSlot as SlotId,
  capabilities: manifest.capabilities as PanelCapability[],
  component: VisualizerPanel,
});
