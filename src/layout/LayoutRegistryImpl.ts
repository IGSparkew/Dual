import { useEffect, useState } from 'react';
import type { LayoutDefinition } from '@core/types/layout';
import type { LayoutRegistry } from './LayoutRegistry';

class LayoutRegistryImpl implements LayoutRegistry {
  private layouts = new Map<string, LayoutDefinition>();
  private listeners = new Set<() => void>();

  register(layout: LayoutDefinition): void {
    this.layouts.set(layout.id, layout);
    this.notify();
  }

  unregister(id: string): void {
    if (this.layouts.delete(id)) this.notify();
  }

  get(id: string): LayoutDefinition | undefined {
    return this.layouts.get(id);
  }

  getAll(): LayoutDefinition[] {
    return Array.from(this.layouts.values());
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }
}

export const layoutRegistry: LayoutRegistry = new LayoutRegistryImpl();

export function useLayoutRegistry(): LayoutDefinition[] {
  const [layouts, setLayouts] = useState(() => layoutRegistry.getAll());

  useEffect(() => {
    setLayouts(layoutRegistry.getAll());
    return layoutRegistry.subscribe(() => setLayouts(layoutRegistry.getAll()));
  }, []);

  return layouts;
}
