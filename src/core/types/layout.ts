export type LayoutNode =
  | { type: 'split'; axis: 'x' | 'y'; ratio: number; children: [LayoutNode, LayoutNode] }
  | { type: 'panel'; panelId: string };

export interface LayoutDefinition {
  id: string;
  name: string;
  icon?: string;
  tree: LayoutNode;
}
