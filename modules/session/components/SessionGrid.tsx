import { useState } from 'react';
import { hasSampleDrag } from '@core/types/sample-drag';
import type { RawClip } from '../session';
import styles from '../SessionModule.module.css';
import { Clip } from './Clip';

export interface SessionGridProps {
  clips: RawClip[];
  labels: Record<string, string>;
  playing: string[];
  selection: string[];
  focused: string | null;
  launchEnabled: boolean;
  onSelect: (clip: RawClip, additive: boolean) => void;
  onLaunch: (clip: RawClip) => void;
  onRename: (clip: RawClip, label: string) => void;
  /** A sound dropped from the browser: on a clip it retargets that clip, on
   *  empty space (`clip` null) it creates a new one. */
  onSampleDrop: (transfer: DataTransfer, clip: RawClip | null) => void;
}

export function SessionGrid(props: SessionGridProps) {
  const playing = new Set(props.playing);
  const selection = new Set(props.selection);
  const [dropTarget, setDropTarget] = useState(false);

  return (
    <div
      className={styles.scrollArea}
      data-drop-target={dropTarget}
      // Clips stop these events themselves, so anything reaching here landed on
      // empty space and means "new clip".
      onDragOver={(event) => {
        if (!hasSampleDrag(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropTarget(false);
        }
      }}
      onDrop={(event) => {
        if (!hasSampleDrag(event.dataTransfer)) return;
        event.preventDefault();
        setDropTarget(false);
        props.onSampleDrop(event.dataTransfer, null);
      }}
    >
      {props.clips.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyLabel}>
            Aucun clip — clique sur « + Clip » ou dépose un sample
          </span>
        </div>
      ) : (
        <div className={styles.clips}>
          {props.clips.map((clip) => (
            <Clip
              key={clip.name}
              clip={clip}
              label={props.labels[clip.name] ?? clip.name}
              isPlaying={playing.has(clip.name)}
              isSelected={selection.has(clip.name)}
              isFocused={clip.name === props.focused}
              launchEnabled={props.launchEnabled}
              onSelect={(additive) => props.onSelect(clip, additive)}
              onLaunch={() => props.onLaunch(clip)}
              onRename={(label) => props.onRename(clip, label)}
              onSampleDrop={(transfer) => props.onSampleDrop(transfer, clip)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
