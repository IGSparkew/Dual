import { useState } from 'react';
import { slugify, userPackName, type ImportKind } from '../browser';
import styles from '../BrowserModule.module.css';

export interface ImportDialogProps {
  /** Audio file names in the drop, already filtered. */
  fileNames: string[];
  /** Type detected from the file names — the user may override it. */
  detected: ImportKind;
  /** Name guessed from the dropped folder or file. */
  suggestedName: string;
  busy: boolean;
  onConfirm: (kind: ImportKind, packName: string) => void;
  onCancel: () => void;
}

const KIND_LABELS: Record<ImportKind, string> = {
  single: 'Sample unique',
  'drum-bank': 'Banque de batterie',
  pitched: 'Instrument pitché',
};

/** How the import will be played, so the choice is judged on its result. */
function usageHint(kind: ImportKind, packName: string): string {
  if (kind === 'drum-bank') return `s("bd sd").bank("${packName}")`;
  if (kind === 'pitched') return `note("c3 e3 g3").sound("${packName}")`;
  return `s("${packName}")`;
}

/** Confirms an import: the detected type (correctable) and the pack name. */
export function ImportDialog({
  fileNames,
  detected,
  suggestedName,
  busy,
  onConfirm,
  onCancel,
}: ImportDialogProps) {
  const [kind, setKind] = useState<ImportKind>(detected);
  const [rawName, setRawName] = useState(suggestedName);

  const slug = slugify(rawName);
  const packName = userPackName(slug);
  const valid = slug.length > 0 && fileNames.length > 0;

  return (
    <div className={styles.dialogBackdrop} onClick={busy ? undefined : onCancel}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <h3 className={styles.dialogTitle}>Importer des samples</h3>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select
            className={styles.select}
            value={kind}
            disabled={busy}
            onChange={(event) => setKind(event.target.value as ImportKind)}
          >
            {(Object.keys(KIND_LABELS) as ImportKind[]).map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
                {value === detected ? ' (détecté)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nom</span>
          <input
            className={styles.input}
            value={rawName}
            disabled={busy}
            autoFocus
            onChange={(event) => setRawName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && valid && !busy) onConfirm(kind, packName);
              if (event.key === 'Escape' && !busy) onCancel();
            }}
          />
        </label>

        <p className={styles.dialogHint}>
          {fileNames.length} fichier{fileNames.length > 1 ? 's' : ''} →{' '}
          <code>{valid ? usageHint(kind, packName) : '…'}</code>
        </p>

        <div className={styles.dialogActions}>
          <button className={styles.btn} onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => onConfirm(kind, packName)}
            disabled={!valid || busy}
          >
            {busy ? 'Import…' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
