export type PanelCapability =
  | 'haps:read'
  | 'code:write'
  | 'code:read'
  | 'state:read'
  | 'state:write';

export type SlotId =
  | 'center-top'
  | 'center-bottom'
  | 'left'
  | 'right'
  | 'bottom';

export interface PanelManifest {
  id: string;
  name: string;
  version: string;
  icon: string;
  description: string;
  defaultSlot: SlotId;
  minSize: { width: number; height: number };
  capabilities: PanelCapability[];
}
