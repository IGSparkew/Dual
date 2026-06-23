import { SessionGridProps } from "../types/SessionGridProps";
import styles from '../SessionPanel.module.css';
import { Clip } from "./Clip";

export function SessionGrid(props: SessionGridProps) {
    return (
        <div className={styles.scrollArea}>
            {props.tracks.map(track => (
                <div className={styles.row} key={track.id}>
                    <div className={styles.trackHeader}>
                        <div className={styles.trackColor} />
                        <span className={styles.trackName}>
                            {track.name}
                        </span>
                    </div>
                    <div className={styles.clips}>
                        {track.clips.map(clip => (
                            <Clip
                                key={clip.id}
                                clip={clip}
                                isSelected={clip.id === props.selectedClipId}
                                onSelect={() => props.onSelectClip(clip)}
                                onRename={(name) => props.onRenameClip(clip, name)}
                            />
                        ))}
                    </div>
                </div>
            ))}
            {props.tracks.length === 0 && (
                <div className={styles.empty}>
                    <span className={styles.emptyLabel}>Aucune track — clique sur "+ Track"</span>
                </div>
            )}
        </div>
    )
}