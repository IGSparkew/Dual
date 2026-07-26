import { Play } from 'lucide-react';
import type { SoundEntry } from '../browser';
import styles from '../BrowserModule.module.css';

export interface SoundRowProps {
  entry: SoundEntry;
  /** Bank the row sits under, carried into the drag payload. */
  bank: string | null;
  onPreview: (entry: SoundEntry) => void;
  onDragStart: (entry: SoundEntry, bank: string | null, event: React.DragEvent) => void;
}

/**
 * One sound of the tree. The whole row is the preview trigger (a click must
 * audition without any aiming) and the drag source — the drag payload is what
 * the session reads to build a clip.
 */
export function SoundRow({ entry, bank, onPreview, onDragStart }: SoundRowProps) {
  return (
    <div
      className={styles.soundRow}
      draggable
      onDragStart={(event) => onDragStart(entry, bank, event)}
      onClick={() => onPreview(entry)}
      title={`${entry.name} — ${entry.variants} fichier${entry.variants > 1 ? 's' : ''}`}
    >
      <Play className={styles.playIcon} size={10} />
      <span className={styles.soundName}>{entry.displayName}</span>
      {entry.kind === 'pitched' && <span className={styles.tag}>pitched</span>}
      {entry.kind === 'drum' && entry.variants > 1 && (
        <span className={styles.variants}>:{entry.variants - 1}</span>
      )}
    </div>
  );
}
