import { panelRegistry } from '@layout/PanelRegistryImpl';
import type { SlotId, PanelCapability } from '@core/types/panel';
import manifest from './manifest.json';
import { MixerPanel } from './MixerPanel';

panelRegistry.register({
  ...manifest,
  defaultSlot: manifest.defaultSlot as SlotId,
  capabilities: manifest.capabilities as PanelCapability[],
  component: MixerPanel,
});
