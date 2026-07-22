import type { LayoutNode } from '@core/types/layout';
import { SplitPane } from './SplitPane';
import { PanelContainer } from './PanelContainer';

interface LayoutRendererProps {
  node: LayoutNode;
  layoutId: string;
  path?: number[];
}

export function LayoutRenderer({ node, layoutId, path = [] }: LayoutRendererProps) {
  if (node.type === 'panel') {
    const slotKey = path.length ? path.join('.') : 'root';
    return <PanelContainer layoutId={layoutId} slotKey={slotKey} defaultPanelId={node.panelId} />;
  }

  return (
    <SplitPane axis={node.axis} defaultRatio={node.ratio}>
      <LayoutRenderer node={node.children[0]} layoutId={layoutId} path={[...path, 0]} />
      <LayoutRenderer node={node.children[1]} layoutId={layoutId} path={[...path, 1]} />
    </SplitPane>
  );
}
