import type { PanelProps } from '@layout/registry/PanelRegistry';
import { useEffect, useRef, useState } from 'react';
import type { Clip, Track } from '@core/types/clip';
import { SessionToolbar } from './components/SessionToolBar';
import { SessionGrid } from './components/SessionGrid';
import { parseCodeToTracks, type ParsedTrack } from './session-code-parser';
import styles from './SessionPanel.module.css';

/** Effective code for a clip: muted clips are silenced with `.gain(0)`. */
function clipCode(clip: Clip): string {
  if (!clip.isMuted) return clip.code;
  return /\.gain\(0\)\s*$/.test(clip.code) ? clip.code : `${clip.code}.gain(0)`;
}

/** Code for a single track: bare clip if one, else its own `stack(...)`. */
function trackToCode(clips: Clip[], wrapSingle: boolean): string {
  if (clips.length === 1 && !wrapSingle) return clipCode(clips[0]);
  return `stack(${clips.map(clipCode).join(', ')})`;
}

/**
 * Build the editor code from the tracks using the nested-stack convention.
 * Each track with multiple tracks present is wrapped in its own `stack(...)`
 * so the parser can recover the track structure unambiguously.
 */
function buildGlobalCode(tracks: Track[]): string {
  const nonEmpty = tracks.filter(t => t.clips.length > 0);
  if (nonEmpty.length === 0) return '';

  if (nonEmpty.length === 1) {
    const clips = nonEmpty[0].clips;
    if (clips.length === 1) return clipCode(clips[0]);
    return `stack(\n${clips.map(c => `  ${clipCode(c)}`).join(',\n')}\n)`;
  }

  // Multiple tracks → wrap each track in its own stack (even single-clip ones)
  const trackCodes = nonEmpty.map(t => trackToCode(t.clips, true));
  return `stack(\n${trackCodes.map(tc => `  ${tc}`).join(',\n')}\n)`;
}

/**
 * Reconcile the visual tracks with the tracks parsed from the editor. Existing
 * tracks and clips are matched by position so their IDs/names survive edits.
 * Trailing empty tracks (created via the UI, with no code representation) are
 * preserved.
 */
function reconcileTracksWithCodes(tracks: Track[], parsed: ParsedTrack[]): Track[] {
  const now = Date.now();

  const result: Track[] = parsed.map((clipCodes, ti) => {
    const existingTrack = tracks[ti];
    const trackId = existingTrack?.id ?? `track-${now}-${ti}`;
    const trackName = existingTrack?.name ?? `Track ${ti + 1}`;
    const clips: Clip[] = clipCodes.map((rawCode, ci) => {
      // A trailing `.gain(0)` means the clip is muted — strip it so clip.code
      // stays clean and the mute lives in the isMuted flag.
      const isMuted = /\.gain\(0\)\s*$/.test(rawCode);
      const code = isMuted ? rawCode.replace(/\.gain\(0\)\s*$/, '') : rawCode;
      const prev = existingTrack?.clips[ci];
      if (prev) return { ...prev, code, trackId, isMuted };
      return {
        id: `clip-${now}-${ti}-${ci}`,
        name: `Clip ${ci + 1}`,
        code,
        trackId,
        isPlaying: false,
        isMuted,
      };
    });
    return { id: trackId, name: trackName, clips };
  });

  // Keep trailing empty tracks the user created — code can't encode them.
  const trailingEmpty = tracks.slice(parsed.length).filter(t => t.clips.length === 0);
  return [...result, ...trailingEmpty];
}

export function SessionPanel({ api }: PanelProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  // Keeps the last known global code so we can restore it on deselect
  const globalCodeRef = useRef('');

  // Sync editor → clip or global state
  useEffect(() => {
    return api.on('code:changed', ({ code, origin }) => {
      if (origin !== 'user_edit') return;

      if (!selectedClipId) {
        // Global mode: parse the editor code back into tracks/clips
        globalCodeRef.current = code;
        const parsed = parseCodeToTracks(code);
        if (parsed === null) return; // incomplete/invalid — keep current clips
        setTracks(prev => reconcileTracksWithCodes(prev, parsed));
        return;
      }

      // Clip mode: update the selected clip and rebuild global code
      setTracks(prev => {
        const next = prev.map(t => ({
          ...t,
          clips: t.clips.map(c => (c.id === selectedClipId ? { ...c, code } : c)),
        }));
        globalCodeRef.current = buildGlobalCode(next);
        return next;
      });
    });
  }, [selectedClipId]);

  const handleAddTrack = () => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: `Track ${tracks.length + 1}`,
      clips: [],
    };
    setTracks(prev => [...prev, newTrack]);
  };

  const handleAddClip = () => {
    if (tracks.length === 0) return;
    const targetTrack = tracks[tracks.length - 1];
    const newClip: Clip = {
      id: `clip-${Date.now()}`,
      name: `Clip ${targetTrack.clips.length + 1}`,
      code: 's("bd")',
      trackId: targetTrack.id,
      isPlaying: false,
      isMuted: false,
    };
    const newTracks = tracks.map(t =>
      t.id === targetTrack.id ? { ...t, clips: [...t.clips, newClip] } : t
    );
    setTracks(newTracks);
    // Deselect and show updated global code
    setSelectedClipId(null);
    const code = buildGlobalCode(newTracks);
    globalCodeRef.current = code;
    api.modifyCode(() => code);
  };

  const handleSelectClip = (clip: Clip) => {
    if (selectedClipId === clip.id) {
      // Deselect: restore global code view
      setSelectedClipId(null);
      api.modifyCode(() => globalCodeRef.current);
      return;
    }
    setSelectedClipId(clip.id);
    api.modifyCode(() => clip.code);
    api.emit('clip:selected', { clipId: clip.id, patternCode: clip.code });
  };

  const handleRenameClip = (clip: Clip, name: string) => {
    setTracks(prev =>
      prev.map(t => ({
        ...t,
        clips: t.clips.map(c => (c.id === clip.id ? { ...c, name } : c)),
      }))
    );
  };

  const handleToggleMute = () => {
    if (!selectedClipId) return;
    setTracks(prev => {
      const next = prev.map(t => ({
        ...t,
        clips: t.clips.map(c =>
          c.id === selectedClipId ? { ...c, isMuted: !c.isMuted } : c
        ),
      }));
      // Keep the global code in sync; the active clip view stays unchanged.
      globalCodeRef.current = buildGlobalCode(next);
      return next;
    });
  };

  const selectedClip =
    selectedClipId !== null
      ? tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId) ?? null
      : null;

  return (
    <div className={styles.panel}>
      <SessionToolbar
        onAddTrack={handleAddTrack}
        onAddClip={handleAddClip}
        onToggleMute={handleToggleMute}
        muteDisabled={selectedClip === null}
        muteActive={selectedClip?.isMuted ?? false}
      />
      <SessionGrid
        tracks={tracks}
        selectedClipId={selectedClipId}
        onSelectClip={handleSelectClip}
        onRenameClip={handleRenameClip}
      />
    </div>
  );
}
