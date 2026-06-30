import { VolumeXIcon, Group, Ungroup, Plus, ListMusic, Grid3x3, Trash2 } from 'lucide-react';
import type { OutputMode } from '@core/state/store';
import styles from '../SessionModule.module.css';

interface SessionToolbarProps {
  outputMode: OutputMode;
  onToggleMode: () => void;
  onAddClip: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onToggleMute: () => void;
  onDelete: () => void;
  groupDisabled: boolean;
  ungroupDisabled: boolean;
  muteDisabled: boolean;
  muteActive: boolean;
  deleteDisabled: boolean;
  addDisabled: boolean;
}

export function SessionToolbar({
  outputMode,
  onToggleMode,
  onAddClip,
  onGroup,
  onUngroup,
  onToggleMute,
  onDelete,
  groupDisabled,
  ungroupDisabled,
  muteDisabled,
  muteActive,
  deleteDisabled,
  addDisabled,
}: SessionToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <button
        className={styles.toolbarBtn}
        onClick={onToggleMode}
        title="Basculer session / arrangement"
      >
        {outputMode === 'session' ? <Grid3x3 size={13} /> : <ListMusic size={13} />}
        {outputMode === 'session' ? 'Session' : 'Arrangement'}
      </button>
      <div className={styles.toolbarDivider} />
      <button className={styles.toolbarBtn} onClick={onAddClip} disabled={addDisabled}>
        <Plus size={13} /> Clip
      </button>
      <div className={styles.toolbarDivider} />
      <button className={styles.toolbarBtn} onClick={onGroup} disabled={groupDisabled}>
        <Group size={13} /> Grouper
      </button>
      <button className={styles.toolbarBtn} onClick={onUngroup} disabled={ungroupDisabled}>
        <Ungroup size={13} /> Dégrouper
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
      <div className={styles.toolbarDivider} />
      <button
        className={styles.toolbarBtn}
        onClick={onDelete}
        disabled={deleteDisabled}
        title={deleteDisabled ? 'Sélectionne un clip' : 'Supprimer le clip'}
      >
        <Trash2 size={13} /> Supprimer
      </button>
    </div>
  );
}
