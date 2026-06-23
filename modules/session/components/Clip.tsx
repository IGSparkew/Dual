import { useEffect, useRef, useState } from 'react';
import styles from '../SessionPanel.module.css';
import { ClipCellProps } from "../types/ClipProps";

export function Clip(props: ClipCellProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(props.clip.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    const startEdit = () => {
        setDraft(props.clip.name);
        setEditing(true);
    };

    const commit = () => {
        setEditing(false);
        const name = draft.trim();
        if (name && name !== props.clip.name) props.onRename(name);
    };

    return (
        <div
            className={styles.cellClip}
            data-selected={props.isSelected}
            data-muted={props.clip.isMuted}
            style={{ '--clip-color': props.clip.color } as React.CSSProperties}
            onClick={props.onSelect}
            onDoubleClick={startEdit}
        >
            <div className={styles.clipInner}>
                {editing ? (
                    <input
                        ref={inputRef}
                        className={styles.clipNameInput}
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={e => {
                            if (e.key === 'Enter') commit();
                            if (e.key === 'Escape') setEditing(false);
                        }}
                        onClick={e => e.stopPropagation()}
                        onDoubleClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className={styles.clipName}>{props.clip.name}</span>
                )}
                <span className={styles.clipCode}>{props.clip.code}</span>
            </div>
            {props.clip.isPlaying && (
                <div className={styles.playIndicator}>
                    <span className={styles.playBar}></span>
                    <span className={styles.playBar}></span>
                    <span className={styles.playBar}></span>
                </div>
            )}
        </div>
    );
}
