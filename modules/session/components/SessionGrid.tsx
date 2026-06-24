import type { SessionGridProps } from '../types/SessionGridProps';
import styles from '../SessionPanel.module.css';
import { Clip } from './Clip';

export function SessionGrid(props: SessionGridProps) {
  const playing = new Set(props.playing);
  const selection = new Set(props.selection);

  return (
    <div className={styles.scrollArea}>
      {props.clips.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyLabel}>Aucun clip — clique sur « + Clip »</span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
