import type { PanelProps } from '@layout/registry/PanelRegistry';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@core/state/store';
import type { Decl, GraphError } from '@core/interpreter/CodeRegion';
import { SessionToolbar } from './components/SessionToolBar';
import { SessionGrid } from './components/SessionGrid';
import { NewClipDialog } from './components/NewClipDialog';
import {
  buildGroup,
  buildLeaf,
  clipsReferencing,
  deriveClips,
  dollarRefs,
  expandGroup,
  gainName,
  gateName,
  isValidClipName,
  provisionGate,
  removeClip,
  reprojectDollar,
  toArrangement,
  toSession,
  uniqueName,
  CLIP_TEMPLATES,
  type ClipType,
  type RawClip,
} from './session';
import styles from './SessionModule.module.css';

/**
 * Session View — first consumer of the CodeRegion socle.
 *
 * The clip is a named `const`; the grid reconciles by name (never by position),
 * owns only the gate (`NAME_ON`) and the live `$:` projection, and edits the
 * document by splices that leave the preamble and clip content intact. The
 * editor always shows the whole project — selecting a clip never rewrites it.
 */
export function SessionModule({ api }: PanelProps) {
  const [clips, setClips] = useState<RawClip[]>([]);
  const [errors, setErrors] = useState<GraphError[]>([]);
  const [complexDollar, setComplexDollar] = useState(false);

  // Display labels are cosmetic local state, keyed by the immutable code name.
  const [labels, setLabels] = useState<Record<string, string>>({});
  // Multi-selection (for grouping) and the focused clip (for mute / highlight).
  const [selection, setSelection] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);

  const outputMode = useStore((s) => s.outputMode);

  // The set of active (playing) clips. In session mode it mirrors the `$:`
  // block; in arrangement mode (no `$:`) it survives in this ref alone.
  const playingRef = useRef<string[]>([]);
  const [playing, setPlayingState] = useState<string[]>([]);
  const setPlaying = (names: string[]) => {
    playingRef.current = names;
    setPlayingState(names);
  };

  const frozen = errors.length > 0;

  /** Re-derive the whole model from the current document. */
  const refresh = useCallback(() => {
    const code = api.getCode();
    const defs = api.code.list(code);
    if (defs === null) return; // parse error — keep the current view

    const raw = deriveClips(api.code, defs);
    const errs = api.code.validateGraph(defs);
    const mode = useStore.getState().outputMode;

    if (mode === 'session') {
      const d = dollarRefs(api.code, code);
      setPlaying(d.names);
      setComplexDollar(d.complex);
      const clipNames = new Set(raw.map((c) => c.name));
      for (const ref of d.names) {
        if (!clipNames.has(ref)) {
          errs.push({
            kind: 'dead-ref',
            detail: `La sortie référence « ${ref} », qui n'existe pas.`,
          });
        }
      }
    } else {
      setComplexDollar(false);
    }

    setClips(raw);
    setErrors(errs);
  }, [api]);

  useEffect(() => {
    refresh();
    return api.on('code:changed', () => {
      // React to hand edits AND writes from other panels (mixer mute, ...).
      // Our own writes trigger a redundant refresh, which is harmless (pure
      // derivation from the document).
      refresh();
    });
  }, [api, refresh]);

  /** Apply new document text (re-evaluates audio) and re-derive the model. */
  const apply = (code: string) => {
    api.code.write(code);
    refresh();
  };

  // ─── Selection ─────────────────────────────────────────────────────────────

  const handleSelect = (clip: RawClip, additive: boolean) => {
    if (additive) {
      setSelection((prev) =>
        prev.includes(clip.name)
          ? prev.filter((n) => n !== clip.name)
          : [...prev, clip.name],
      );
      setFocused(clip.name);
      return;
    }
    setSelection([clip.name]);
    setFocused(clip.name);
    api.emit('clip:selected', { clipId: clip.name, patternCode: clip.source });
  };

  // ─── Launch (session mode only) ─────────────────────────────────────────────

  const handleLaunch = (clip: RawClip) => {
    if (frozen || complexDollar || outputMode !== 'session') return;
    const set = new Set(playingRef.current);
    set.has(clip.name) ? set.delete(clip.name) : set.add(clip.name);
    const names = clips.map((c) => c.name).filter((n) => set.has(n));
    apply(reprojectDollar(api.code, api.getCode(), names));
  };

  // ─── Mute (gate flip on the focused clip) ───────────────────────────────────

  const handleToggleMute = () => {
    if (frozen || !focused) return;
    const clip = clips.find((c) => c.name === focused);
    if (!clip) return;
    const code = api.getCode();
    const def = api.code.list(code)?.find((d) => d.name === focused);
    if (!def) return;

    if (!clip.hasGate) {
      // First mute on a hand-written clip: add the gate machinery (muted).
      apply(provisionGate(api.code, code, def));
      return;
    }
    // Flip the gate const's value in place (1-char splice via setInit).
    apply(api.code.setInit(code, gateName(focused), clip.isMuted ? '1' : '0'));
  };

  // ─── Create clip (name + type via the dialog) ───────────────────────────────

  const [newClipOpen, setNewClipOpen] = useState(false);

  /** Returns an error message for the dialog, or null when the clip is in. */
  const handleCreateClip = (name: string, type: ClipType): string | null => {
    const code = api.getCode();
    if (!isValidClipName(name)) {
      return 'Nom invalide — lettres, chiffres et _ uniquement (pas d’espace).';
    }
    const taken = new Set((api.code.list(code) ?? []).map((d) => d.name));
    if (taken.has(name) || taken.has(gateName(name)) || taken.has(gainName(name))) {
      return `« ${name} » existe déjà.`;
    }
    const next = api.code.insertDecl(code, buildLeaf(name, CLIP_TEMPLATES[type]));
    if (api.code.list(next) === null) {
      // The identifier passed the regex but breaks the parse (JS keyword…).
      return `« ${name} » n'est pas utilisable comme nom (mot réservé ?).`;
    }
    setNewClipOpen(false);
    apply(next);
    setSelection([name]);
    setFocused(name);
    api.emit('clip:selected', { clipId: name, patternCode: CLIP_TEMPLATES[type] });
    return null;
  };

  // ─── Group / ungroup ────────────────────────────────────────────────────────

  const handleGroup = () => {
    if (frozen) return;
    const members = selection.slice();
    if (members.length < 2) {
      api.showNotification('Sélectionne au moins 2 clips à grouper', 'warning');
      return;
    }
    const code = api.getCode();
    const defs = api.code.list(code) ?? [];
    const name = uniqueName(defs.map((d) => d.name), 'group');
    // Validate the prospective graph (group declared last, after its members).
    const prospective: Decl[] = [
      ...defs,
      {
        name,
        declKind: 'const',
        initKind: 'pattern',
        callee: 'stack',
        source: `stack(${members.join(', ')})`,
        refs: members,
        start: code.length,
        end: code.length,
        initStart: code.length,
        initEnd: code.length,
      },
    ];
    const errs = api.code.validateGraph(prospective);
    if (errs.length) {
      api.showNotification(errs[0].detail, 'error');
      return;
    }
    setSelection([]);
    apply(api.code.insertDecl(code, buildGroup(name, members)));
  };

  // Shared removal: refuse if another clip references it (would leave a dead
  // ref), unproject it, then delete its const + gate/gain consts.
  const removeClipByName = (name: string) => {
    const referencers = clipsReferencing(clips, name);
    if (referencers.length) {
      api.showNotification(
        `Impossible : « ${name} » est utilisé par ${referencers.join(', ')}`,
        'error',
      );
      return;
    }
    const next = removeClip(api.code, api.getCode(), name, playingRef.current);
    setSelection((s) => s.filter((n) => n !== name));
    if (focused === name) setFocused(null);
    apply(next);
  };

  const handleDelete = () => {
    if (frozen || !focused) return;
    removeClipByName(focused);
  };

  const handleUngroup = () => {
    if (frozen || !focused) return;
    const clip = clips.find((c) => c.name === focused);
    if (!clip || !clip.isGroup) {
      api.showNotification('Sélectionne un groupe à dégrouper', 'warning');
      return;
    }
    // Refuse if another clip references the group (would leave a dead ref).
    const referencers = clipsReferencing(clips, focused);
    if (referencers.length) {
      api.showNotification(
        `Impossible : « ${focused} » est utilisé par ${referencers.join(', ')}`,
        'error',
      );
      return;
    }
    // Expand: promote the group's members so the music keeps playing.
    const next = expandGroup(api.code, api.getCode(), focused, playingRef.current);
    setSelection((s) => s.filter((n) => n !== focused));
    setFocused(null);
    apply(next);
  };

  // ─── Rename (label only — never touches code) ───────────────────────────────

  const handleRename = (clip: RawClip, label: string) => {
    setLabels((prev) => ({ ...prev, [clip.name]: label }));
  };

  // ─── Mode switch (state + output splice) ────────────────────────────────────

  const handleToggleMode = () => {
    if (frozen) return;
    const code = api.getCode();
    const store = useStore.getState();
    if (outputMode === 'session') {
      const next = toArrangement(api.code, code, playingRef.current, store.arrangementCode);
      store.setOutputMode('arrangement');
      apply(next);
    } else {
      const { code: next, captured } = toSession(api.code, code, playingRef.current);
      if (captured) store.setArrangementCode(captured);
      store.setOutputMode('session');
      apply(next);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const focusedClip = focused ? clips.find((c) => c.name === focused) ?? null : null;

  return (
    <div className={styles.panel}>
      <SessionToolbar
        outputMode={outputMode}
        onToggleMode={handleToggleMode}
        onAddClip={() => setNewClipOpen(true)}
        onGroup={handleGroup}
        onUngroup={handleUngroup}
        onToggleMute={handleToggleMute}
        onDelete={handleDelete}
        groupDisabled={frozen || selection.length < 2}
        ungroupDisabled={frozen || !focusedClip?.isGroup}
        muteDisabled={frozen || !focusedClip}
        muteActive={focusedClip?.isMuted ?? false}
        deleteDisabled={frozen || !focusedClip}
        addDisabled={frozen}
      />

      {frozen && (
        <div className={styles.errorBanner} role="alert">
          <span className={styles.errorTitle}>Graphe invalide — panneau gelé</span>
          {errors.slice(0, 4).map((e, i) => (
            <span key={i} className={styles.errorLine}>{e.detail}</span>
          ))}
        </div>
      )}

      {!frozen && complexDollar && (
        <div className={styles.infoBanner}>
          Sortie <code>$:</code> éditée à la main — lancement désactivé.
        </div>
      )}

      <SessionGrid
        clips={clips}
        labels={labels}
        playing={playing}
        selection={selection}
        focused={focused}
        launchEnabled={!frozen && !complexDollar && outputMode === 'session'}
        onSelect={handleSelect}
        onLaunch={handleLaunch}
        onRename={handleRename}
      />

      {newClipOpen && (
        <NewClipDialog
          defaultName={uniqueName(clips.map((c) => c.name))}
          onConfirm={handleCreateClip}
          onCancel={() => setNewClipOpen(false)}
        />
      )}
    </div>
  );
}
