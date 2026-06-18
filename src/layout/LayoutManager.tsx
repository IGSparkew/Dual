import { SplitPane } from './SplitPane';
import { PanelContainer } from './PanelContainer';
import styles from './LayoutManager.module.css';

export type LayoutId = 'production' | 'minimal' | 'live-coding' | 'mixing';

interface LayoutManagerProps {
  layoutId?: LayoutId;
}

export function LayoutManager({ layoutId = 'production' }: LayoutManagerProps) {
  if (layoutId === 'minimal') {
    return (
      <div className={styles.root}>
        <SplitPane axis="y" defaultRatio={0.88}>
          <PanelContainer panelId="editor" />
          <PanelContainer panelId="transport" />
        </SplitPane>
      </div>
    );
  }

  if (layoutId === 'live-coding') {
    return (
      <div className={styles.root}>
        <SplitPane axis="y" defaultRatio={0.88}>
          <SplitPane axis="x" defaultRatio={0.5}>
            <PanelContainer panelId="editor" />
            <PanelContainer panelId="visualizer" />
          </SplitPane>
          <PanelContainer panelId="transport" />
        </SplitPane>
      </div>
    );
  }

  if (layoutId === 'mixing') {
    return (
      <div className={styles.root}>
        <SplitPane axis="y" defaultRatio={0.88}>
          <SplitPane axis="x" defaultRatio={0.65}>
            <PanelContainer panelId="session" />
            <SplitPane axis="y" defaultRatio={0.5}>
              <PanelContainer panelId="mixer" />
              <PanelContainer panelId="effects" />
            </SplitPane>
          </SplitPane>
          <PanelContainer panelId="transport" />
        </SplitPane>
      </div>
    );
  }

  // production (default)
  return (
    <div className={styles.root}>
      <SplitPane axis="y" defaultRatio={0.88}>
        <SplitPane axis="x" defaultRatio={0.2}>
          <PanelContainer panelId="session" />
          <SplitPane axis="x" defaultRatio={0.75}>
            <SplitPane axis="y" defaultRatio={0.5}>
              <PanelContainer panelId="visualizer" />
              <PanelContainer panelId="editor" />
            </SplitPane>
            <PanelContainer panelId="mixer" />
          </SplitPane>
        </SplitPane>
        <PanelContainer panelId="transport" />
      </SplitPane>
    </div>
  );
}
