import type { PanelManifest } from '@core/types/panel';
import type { ComponentType } from 'react';
import type { PanelApi } from '../api/PanelApi';

export interface PanelProps {
  api: PanelApi;
}

export interface RegisteredPanel extends PanelManifest {
  component: ComponentType<PanelProps>;
}

export interface PanelRegistry {
  register(panel: RegisteredPanel): void;
  get(id: string): RegisteredPanel | undefined;
  getAll(): RegisteredPanel[];
}
