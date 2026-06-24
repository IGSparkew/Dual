import { useEffect, useRef, useState } from 'react';
import { Play, Square, Layers } from 'lucide-react';
import styles from '../SessionPanel.module.css';
import type { ClipCellProps } from '../types/ClipProps';

export function Clip(props: ClipCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(props.label);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const label = draft.trim();
    if (label && label !== props.label) props.onRename(label);
  };

  const readOnly = !props.clip.hasGate;

  return (
    <div
      className={styles.cellClip}
      data-selected={props.isSelected}
      data-focused={props.isFocused}
      data-muted={props.clip.isMuted}
      data-playing={props.isPlaying}
      onClick={(e) => props.onSelect(e.ctrlKey || e.metaKey)}
      onDoubleClick={startEdit}
    >
      <div className={styles.clipInner}>
        <div className={styles.clipHeader}>
          {props.clip.isGroup && <Layers size={10} className={styles.clipBadge} />}
          {editing ? (
            <input
              ref={inputRef}
              className={styles.clipNameInput}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={styles.clipName}>{props.label}</span>
          )}
        </div>
        <span className={styles.clipCode}>{props.clip.source}</span>
        {readOnly && <span className={styles.clipReadOnly}>édité à la main</span>}
      </div>

      <button
        className={styles.launchBtn}
        disabled={!props.launchEnabled}
        title={props.isPlaying ? 'Stop' : 'Launch'}
        onClick={(e) => {
          e.stopPropagation();
          props.onLaunch();
        }}
      >
        {props.isPlaying ? <Square size={11} /> : <Play size={11} />}
      </button>

      {props.isPlaying && (
        <div className={styles.playIndicator}>
          <span className={styles.playBar}></span>
          <span className={styles.playBar}></span>
          <span className={styles.playBar}></span>
        </div>
      )}
    </div>
  );
}
