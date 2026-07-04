import { Plus } from 'lucide-react';
import type { OutputMode } from '@core/state/store';
import styles from '../ArrangementModule.module.css';

interface ArrangementToolbarProps {
  mode: OutputMode;
  addDisabled: boolean;
  onAddSection: () => void;
}

/** Toolbar: mode badge + section creation. The mode toggle itself belongs to
 *  the session toolbar (single writer of the switch). */
export function ArrangementToolbar({ mode, addDisabled, onAddSection }: ArrangementToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <span className={styles.modeBadge} data-mode={mode}>
        {mode === 'arrangement' ? 'Arrangement' : 'Session'}
      </span>
      <div className={styles.toolbarSpacer} />
      <button
        className={styles.toolbarBtn}
        disabled={addDisabled}
        onClick={onAddSection}
        title="Ajouter une section"
      >
        <Plus size={12} />
        Section
      </button>
    </div>
  );
}
