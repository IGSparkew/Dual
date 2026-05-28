import type { PanelManifest } from '@core/types/panel';
import type { ComponentType } from 'react';

export interface RegisteredPanel extends PanelManifest {
  component: ComponentType;
}

export interface PanelRegistry {
  register(panel: RegisteredPanel): void;
  get(id: string): RegisteredPanel | undefined;
  getAll(): RegisteredPanel[];
}
