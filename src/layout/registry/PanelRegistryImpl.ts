import type { PanelRegistry, RegisteredPanel } from './PanelRegistry';

class PanelRegistryImpl implements PanelRegistry {
  private panels = new Map<string, RegisteredPanel>();

  register(panel: RegisteredPanel): void {
    this.panels.set(panel.id, panel);
  }

  get(id: string): RegisteredPanel | undefined {
    return this.panels.get(id);
  }

  getAll(): RegisteredPanel[] {
    return Array.from(this.panels.values());
  }
}

export const panelRegistry: PanelRegistry = new PanelRegistryImpl();
