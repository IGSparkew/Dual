import { useState } from 'react';
import { Drum, Piano } from 'lucide-react';
import type { ClipType } from '../session';
import styles from '../SessionModule.module.css';

interface NewClipDialogProps {
  /** Prefilled name (next free `clipN`). */
  defaultName: string;
  /** Creates the clip; returns an error message to display, null on success
   *  (the parent closes the dialog itself). */
  onConfirm: (name: string, type: ClipType) => string | null;
  onCancel: () => void;
}

/** Small in-panel dialog shown by the "Clip" toolbar button: pick the clip's
 *  const name and its editor type (drum grid vs piano roll — decides the
 *  initial content only; both stay plain `stack(...)` clips). */
export function NewClipDialog({ defaultName, onConfirm, onCancel }: NewClipDialogProps) {
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState<ClipType>('drum');
  const [error, setError] = useState<string | null>(null);

  const submit = () => setError(onConfirm(name.trim(), type));

  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-label="Nouveau clip"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      >
        <div className={styles.dialogTitle}>Nouveau clip</div>

        <label className={styles.dialogLabel}>
          Nom
          <input
            className={styles.dialogInput}
            value={name}
            autoFocus
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </label>

        <div className={styles.dialogLabel}>
          Type
          <div className={styles.dialogTypes}>
            <button
              className={styles.toolbarBtn}
              data-active={type === 'drum'}
              onClick={() => setType('drum')}
            >
              <Drum size={13} /> Drum grid
            </button>
            <button
              className={styles.toolbarBtn}
              data-active={type === 'piano'}
              onClick={() => setType('piano')}
            >
              <Piano size={13} /> Piano roll
            </button>
          </div>
        </div>

        {error && <div className={styles.dialogError}>{error}</div>}

        <div className={styles.dialogActions}>
          <button className={styles.toolbarBtn} onClick={onCancel}>
            Annuler
          </button>
          <button className={styles.toolbarBtn} data-active onClick={submit}>
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}
