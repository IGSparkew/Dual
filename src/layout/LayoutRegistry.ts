import type { LayoutDefinition } from '@core/types/layout';

export interface LayoutRegistry {
  register(layout: LayoutDefinition): void;
  unregister(id: string): void;
  get(id: string): LayoutDefinition | undefined;
  getAll(): LayoutDefinition[];
  subscribe(callback: () => void): () => void;
}
