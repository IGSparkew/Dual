import { PanelIcon } from '@layout/components/PanelIcon';
import styles from './PlaceholderPanel.module.css';

interface PlaceholderPanelProps {
  icon: string;
  label: string;
  description?: string;
}

export function PlaceholderPanel({ icon, label, description }: PlaceholderPanelProps) {
  return (
    <div className={styles.root}>
      <span className={styles.icon}><PanelIcon name={icon} size={24} /></span>
      <span className={styles.label}>{label}</span>
      {description && <span className={styles.desc}>{description}</span>}
    </div>
  );
}
