import { ChevronDown, ChevronRight } from 'lucide-react';
import type { BankNode, SoundEntry } from '../browser';
import { displayBank } from '../browser';
import { SoundRow } from './SoundRow';
import styles from '../BrowserModule.module.css';

export interface BankGroupProps {
  node: BankNode;
  expanded: boolean;
  onToggle: (bank: string | null) => void;
  onPreview: (entry: SoundEntry) => void;
  onDragStart: (entry: SoundEntry, bank: string | null, event: React.DragEvent) => void;
}

/**
 * A collapsible bank (`rolandtr909`, an imported kit) or the loose-sounds
 * bucket (`bank: null`). The header itself is draggable for a real bank: that
 * is how a whole kit lands on the session as a `.bank(…)` clip.
 */
export function BankGroup({ node, expanded, onToggle, onPreview, onDragStart }: BankGroupProps) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const label = node.bank === null ? 'Samples' : displayBank(node.bank);

  return (
    <div className={styles.bankGroup}>
      <div
        className={styles.bankHeader}
        draggable={node.bank !== null}
        onDragStart={(event) => {
          if (node.bank !== null) onDragStart(node.sounds[0], node.bank, event);
        }}
        onClick={() => onToggle(node.bank)}
      >
        <Chevron size={11} />
        <span className={styles.bankName}>{label}</span>
        <span className={styles.bankCount}>{node.sounds.length}</span>
      </div>
      {expanded && (
        <div className={styles.bankSounds}>
          {node.sounds.map((entry) => (
            <SoundRow
              key={entry.name}
              entry={entry}
              bank={node.bank}
              onPreview={onPreview}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}
