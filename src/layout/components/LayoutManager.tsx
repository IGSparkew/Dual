import { layoutRegistry } from '../registry/LayoutRegistryImpl';
import { LayoutRenderer } from './LayoutRenderer';
import styles from './LayoutManager.module.css';

interface LayoutManagerProps {
  layoutId: string;
}

export function LayoutManager({ layoutId }: LayoutManagerProps) {
  const layout = layoutRegistry.get(layoutId);

  if (!layout) {
    return (
      <div className={styles.empty}>
        Layout &ldquo;{layoutId}&rdquo; introuvable
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <LayoutRenderer key={layout.id} node={layout.tree} />
    </div>
  );
}
