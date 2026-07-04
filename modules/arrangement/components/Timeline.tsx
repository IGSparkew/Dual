import type { Section } from '../arrangement';
import { SectionHeader } from './SectionHeader';
import styles from '../ArrangementModule.module.css';

interface TimelineProps {
  /** Row names: real clips first, then phantom members (in `phantoms`). */
  tracks: string[];
  /** Members referenced by the arrange but not declared as clips. */
  phantoms: Set<string>;
  sections: Section[];
  disabled: boolean;
  onToggle: (index: number, name: string) => void;
  onDuration: (index: number, duration: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

/**
 * Horizontal timeline: one row per clip, one column per section, column width
 * proportional to the section duration (CSS grid `fr` units).
 */
export function Timeline({
  tracks,
  phantoms,
  sections,
  disabled,
  onToggle,
  onDuration,
  onMove,
  onRemove,
}: TimelineProps) {
  const columns = `minmax(90px, 120px) ${sections
    .map((s) => `minmax(52px, ${s.duration}fr)`)
    .join(' ')}`;

  return (
    <div className={styles.scrollArea}>
      <div className={styles.grid} style={{ gridTemplateColumns: columns }}>
        {/* Header row */}
        <div className={styles.cornerCell} />
        {sections.map((section, i) => (
          <SectionHeader
            key={i}
            section={section}
            index={i}
            count={sections.length}
            disabled={disabled}
            onDuration={onDuration}
            onMove={onMove}
            onRemove={onRemove}
          />
        ))}

        {/* One row per track */}
        {tracks.map((name) => (
          <TimelineRow
            key={name}
            name={name}
            phantom={phantoms.has(name)}
            sections={sections}
            disabled={disabled}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

interface TimelineRowProps {
  name: string;
  phantom: boolean;
  sections: Section[];
  disabled: boolean;
  onToggle: (index: number, name: string) => void;
}

function TimelineRow({ name, phantom, sections, disabled, onToggle }: TimelineRowProps) {
  return (
    <>
      <div className={styles.trackName} data-phantom={phantom || undefined} title={name}>
        {name}
        {phantom && <span className={styles.phantomBadge}>manquant</span>}
      </div>
      {sections.map((section, i) => {
        const active = section.members.includes(name);
        return (
          <button
            key={i}
            className={styles.cell}
            data-active={active || undefined}
            data-complex={section.complex || undefined}
            disabled={disabled || section.complex || phantom}
            onClick={() => onToggle(i, name)}
            title={
              section.complex
                ? 'Section complexe — édition dans le code uniquement'
                : `${name} — section ${i + 1}`
            }
          >
            {active && <span className={styles.cellBlock} />}
          </button>
        );
      })}
    </>
  );
}
