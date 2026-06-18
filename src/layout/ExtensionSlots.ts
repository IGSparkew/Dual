import type { ComponentType } from 'react';

export type ExtensionSlotId =
  | 'toolbar:left'
  | 'toolbar:right'
  | 'context-menu:clip'
  | 'context-menu:note'
  | 'channel-strip:top'
  | 'channel-strip:bottom'
  | 'fx-rack:slot'
  | 'browser:actions'
  | 'status-bar';

export interface SlotEntry {
  id: string;
  component: ComponentType;
  priority?: number;
}

export interface ExtensionSlots {
  register(slotId: ExtensionSlotId, entry: SlotEntry): void;
  unregister(slotId: ExtensionSlotId, entryId: string): void;
  getComponents(slotId: ExtensionSlotId): SlotEntry[];
}
