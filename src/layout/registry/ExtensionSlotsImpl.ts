import type { ExtensionSlots, ExtensionSlotId, SlotEntry } from './ExtensionSlots';

class ExtensionSlotsImpl implements ExtensionSlots {
  private slots = new Map<ExtensionSlotId, SlotEntry[]>();

  register(slotId: ExtensionSlotId, entry: SlotEntry): void {
    const existing = this.slots.get(slotId) ?? [];
    const filtered = existing.filter((e) => e.id !== entry.id);
    const updated = [...filtered, entry].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    this.slots.set(slotId, updated);
  }

  unregister(slotId: ExtensionSlotId, entryId: string): void {
    const existing = this.slots.get(slotId) ?? [];
    this.slots.set(
      slotId,
      existing.filter((e) => e.id !== entryId),
    );
  }

  getComponents(slotId: ExtensionSlotId): SlotEntry[] {
    return this.slots.get(slotId) ?? [];
  }
}

export const extensionSlots: ExtensionSlots = new ExtensionSlotsImpl();
