import { VolumeXIcon } from 'lucide-react';
import styles from '../SessionPanel.module.css';

interface SessionToolbarProps {
  onAddTrack: () => void;
  onAddClip: () => void;
  onToggleMute: () => void;
  muteDisabled: boolean;
  muteActive: boolean;
}

export function SessionToolbar({
  onAddTrack,
  onAddClip,
  onToggleMute,
  muteDisabled,
  muteActive,
}: SessionToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button className={styles.toolbarBtn} onClick={onAddTrack}>
        + Track
      </button>
      <div className={styles.toolbarDivider} />
      <button className={styles.toolbarBtn} onClick={onAddClip}>
        + Clip
      </button>
      <div className={styles.toolbarDivider} />
      <button
        className={styles.toolbarBtn}
        onClick={onToggleMute}
        disabled={muteDisabled}
        data-active={muteActive}
        title={muteDisabled ? 'Sélectionne un clip' : muteActive ? 'Réactiver' : 'Mute'}
      >
        <VolumeXIcon size={13} />
        {muteActive ? 'Unmute' : 'Mute'}
      </button>
    </div>
  );
}
