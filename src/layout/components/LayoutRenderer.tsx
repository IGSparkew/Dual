import type { LayoutNode } from '@core/types/layout';
import { SplitPane } from './SplitPane';
import { PanelContainer } from './PanelContainer';

interface LayoutRendererProps {
  node: LayoutNode;
}

export function LayoutRenderer({ node }: LayoutRendererProps) {
  if (node.type === 'panel') {
    return <PanelContainer panelId={node.panelId} />;
  }

  return (
    <SplitPane axis={node.axis} defaultRatio={node.ratio}>
      <LayoutRenderer node={node.children[0]} />
      <LayoutRenderer node={node.children[1]} />
    </SplitPane>
  );
}
