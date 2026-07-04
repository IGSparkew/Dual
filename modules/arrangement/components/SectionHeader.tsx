import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Section } from '../arrangement';
import styles from '../ArrangementModule.module.css';

interface SectionHeaderProps {
  section: Section;
  index: number;
  count: number;
  disabled: boolean;
  onDuration: (index: number, duration: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

/** Column header: duration input (commit on blur/Enter) + move/remove actions. */
export function SectionHeader({
  section,
  index,
  count,
  disabled,
  onDuration,
  onMove,
  onRemove,
}: SectionHeaderProps) {
  const [draft, setDraft] = useState(String(section.duration));

  // Re-sync the draft when the committed duration changes from outside.
  useEffect(() => setDraft(String(section.duration)), [section.duration]);

  const commitDuration = () => {
    const value = Number(draft);
    if (Number.isFinite(value) && value > 0 && value !== section.duration) {
      onDuration(index, value);
    } else {
      setDraft(String(section.duration));
    }
  };

  return (
    <div className={styles.sectionHeader} data-complex={section.complex || undefined}>
      <div className={styles.sectionActions}>
        <button
          className={styles.sectionBtn}
          disabled={disabled || index === 0}
          onClick={() => onMove(index, index - 1)}
          title="Déplacer à gauche"
        >
          <ChevronLeft size={10} />
        </button>
        {section.complex ? (
          <span className={styles.sectionComplex} title={section.rawSource}>
            #{index + 1} ⧉
          </span>
        ) : (
          <input
            className={styles.durationInput}
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            title="Durée (cycles)"
          />
        )}
        <button
          className={styles.sectionBtn}
          disabled={disabled || index === count - 1}
          onClick={() => onMove(index, index + 1)}
          title="Déplacer à droite"
        >
          <ChevronRight size={10} />
        </button>
        <button
          className={styles.sectionBtn}
          data-kind="remove"
          disabled={disabled}
          onClick={() => onRemove(index)}
          title="Supprimer la section"
        >
          <X size={10} />
        </button>
      </div>
    </div>
  );
}
