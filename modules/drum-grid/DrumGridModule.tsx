import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import {
  addRow,
  cycleSubHits,
  deriveClips,
  isSampleName,
  orderRows,
  removeRow,
  renameRow,
  setBank,
  setForm,
  setStepCount,
  toggleStep,
  writeGrid,
  DRUM_BANKS,
  DRUM_SAMPLES,
  STEP_CHOICES,
  type DrumGrid,
  type GridClip,
} from './drum-grid';
import { DrumGridToolbar } from './components/DrumGridToolbar';
import { drawGrid, rowColor, ROW_HEIGHT } from './components/grid-renderer';
import { hitTest, type CellHit } from './components/grid-interaction';
import styles from './DrumGridModule.module.css';

/**
 * Drum Grid — FL-style step sequencer over a named clip's content.
 *
 * The grid edits the arguments of the clip's `stack(...)`: left click toggles
 * a step, right click cycles its sub-hits (`[hh hh]`). One `s("...")` line
 * folds every row (merged) or the pattern is split into one `s()` per row
 * inside the stack — the Split/Merge toolbar button converts between the two.
 *
 * Rows added from the toolbar are a UI overlay until their first hit (a
 * merged all-rest row has no code representation); the first click writes
 * them into the document.
 */
export function DrumGridModule({ api }: PanelProps) {
  const [clips, setClips] = useState<GridClip[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [grid, setGrid] = useState<DrumGrid | null>(null);
  // Samples added as empty rows — UI-only until their first hit.
  const [extras, setExtras] = useState<string[]>([]);
  const [hover, setHover] = useState<CellHit | null>(null);
  // Row label being renamed (index into the displayed rows), null when idle.
  const [editing, setEditing] = useState<number | null>(null);

  const activeRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Display order of the samples (merged form re-derives row order from first
  // appearance in the mini string — without this, rows would jump around).
  const orderRef = useRef<string[]>([]);
  // Accent color index per sample, assigned on first sight and kept for the
  // session so rows keep their color across reorders and removals.
  const colorsRef = useRef<Map<string, number>>(new Map());

  const setActiveClip = (name: string | null) => {
    if (name !== activeRef.current) {
      setExtras([]);
      setEditing(null);
      orderRef.current = [];
      colorsRef.current = new Map();
    }
    activeRef.current = name;
    setActive(name);
  };

  /** Re-derive the whole model from the current document. */
  const refresh = useCallback(() => {
    const code = api.getCode();
    const defs = api.code.list(code);
    if (defs === null) return; // parse error — keep the current view
    const list = deriveClips(api.code, code, defs);
    setClips(list);

    let name = activeRef.current;
    if (!name || !list.some((c) => c.name === name)) name = list[0]?.name ?? null;
    setActiveClip(name);

    let next = name ? list.find((c) => c.name === name)!.grid : null;
    if (next) {
      next = orderRows(next, orderRef.current);
      // Remember the resulting order (deduped for split-form duplicates);
      // samples gone from the document drop out, new ones append at the end.
      orderRef.current = next.rows
        .map((row) => row.sample)
        .filter((sample, i, all) => all.indexOf(sample) === i);
    }
    setGrid(next);
  }, [api]);

  useEffect(() => {
    refresh();
    // React to hand edits AND writes from other panels; reacting to our own
    // writes re-derives (and normalizes) the grid, which is the intent.
    return api.on('code:changed', refresh);
  }, [api, refresh]);

  // Follow the clip selected in the session grid.
  useEffect(
    () =>
      api.on('clip:selected', ({ clipId }) => {
        setActiveClip(clipId);
        refresh();
      }),
    [api, refresh],
  );

  // The grid as drawn: derived rows + the empty overlay rows.
  const displayed: DrumGrid | null = grid
    ? extras.length > 0
      ? {
          ...grid,
          rows: [
            ...grid.rows,
            ...extras.map((sample) => ({
              sample,
              steps: new Array<number>(grid.stepCount).fill(0),
            })),
          ],
        }
      : grid
    : null;

  // Accent color per displayed row — first sight of a sample claims the next
  // palette index, kept in colorsRef for the session (idempotent on re-render).
  const colorOf = (sample: string): string => {
    const map = colorsRef.current;
    let index = map.get(sample);
    if (index === undefined) {
      index = map.size;
      map.set(sample, index);
    }
    return rowColor(index);
  };
  const rowColors = (displayed?.rows ?? []).map((row) => colorOf(row.sample));

  // Mirror for the draw loop (reads outside React's render cycle).
  const viewRef = useRef<{ grid: DrumGrid | null; colors: string[]; hover: CellHit | null }>({
    grid: null,
    colors: [],
    hover: null,
  });
  viewRef.current = { grid: displayed, colors: rowColors, hover };

  // ─── Draw loop (grid + playhead, via the canvas API) ────────────────────────

  useEffect(
    () =>
      api.canvas.loop(() => {
        const canvas = canvasRef.current;
        const view = viewRef.current;
        if (!canvas || !view.grid || view.grid.rows.length === 0) return;
        // 4 beats = 1 cycle — same convention as the mixer's VU loop.
        const { status, position } = api.getTransport();
        const playhead = status === 'playing' ? ((position / 4) % 1 + 1) % 1 : null;
        const surface = api.canvas.surface(canvas);
        if (surface) {
          drawGrid(surface, {
            grid: view.grid,
            colors: view.colors,
            hover: view.hover,
            playhead,
          });
        }
      }),
    [api],
  );

  // ─── Commits (one write each) ───────────────────────────────────────────────

  const applyGrid = (next: DrumGrid) => {
    const name = activeRef.current;
    if (!name) return;
    setGrid(next); // optimistic — refresh re-derives from the document
    api.code.write(writeGrid(api.code, api.getCode(), name, next));
  };

  const emitNote = (type: 'note:created' | 'note:deleted', sample: string, step: number) => {
    if (!grid) return;
    api.emit(type, {
      note: sample,
      begin: step / grid.stepCount,
      end: (step + 1) / grid.stepCount,
    });
  };

  const handleCell = (hit: CellHit, button: number) => {
    if (!grid) return;
    const base = grid.rows.length;

    if (hit.row >= base) {
      // Overlay row: the first hit materializes it into the document.
      if (button === 2) return;
      const index = hit.row - base;
      const sample = extras[index];
      let next = addRow(grid, sample);
      next = toggleStep(next, next.rows.length - 1, hit.step);
      setExtras((xs) => xs.filter((_, i) => i !== index));
      applyGrid(next);
      emitNote('note:created', sample, hit.step);
      return;
    }

    if (button === 2) {
      applyGrid(cycleSubHits(grid, hit.row, hit.step));
      return;
    }

    const row = grid.rows[hit.row];
    const wasOn = row.steps[hit.step] > 0;
    applyGrid(toggleStep(grid, hit.row, hit.step));
    emitNote(wasOn ? 'note:deleted' : 'note:created', row.sample, hit.step);
  };

  const handleRemoveRow = (index: number) => {
    if (!grid) return;
    const base = grid.rows.length;
    if (index >= base) {
      setExtras((xs) => xs.filter((_, i) => i !== index - base));
      return;
    }
    applyGrid(removeRow(grid, index));
  };

  // In merged form two rows with the same sample fold back into one on
  // re-derivation — refuse the duplicate instead of silently merging.
  const isMergedDuplicate = (sample: string, skipIndex = -1) =>
    grid !== null &&
    grid.form === 'merged' &&
    (grid.rows.some((row, i) => i !== skipIndex && row.sample === sample) ||
      extras.some((s, i) => grid.rows.length + i !== skipIndex && s === sample));

  const handleAddRow = (sample: string) => {
    if (!grid) return;
    if (!isSampleName(sample)) {
      api.showNotification(`Nom de sample invalide : « ${sample} »`, 'warning');
      return;
    }
    if (isMergedDuplicate(sample)) {
      api.showNotification(
        `« ${sample} » existe déjà — passe en Split pour doubler un sample`,
        'info',
      );
      return;
    }
    setExtras((xs) => [...xs, sample]);
  };

  const handleRename = (index: number, raw: string) => {
    setEditing(null);
    if (!grid) return;
    const base = grid.rows.length;
    const current = index >= base ? extras[index - base] : grid.rows[index]?.sample;
    const sample = raw.trim();
    if (!sample || current === undefined || sample === current) return;
    if (!isSampleName(sample)) {
      api.showNotification(`Nom de sample invalide : « ${sample} »`, 'warning');
      return;
    }
    if (isMergedDuplicate(sample, index)) {
      api.showNotification(
        `« ${sample} » existe déjà — passe en Split pour doubler un sample`,
        'info',
      );
      return;
    }
    // Carry display order and accent color over to the new name.
    orderRef.current = orderRef.current.map((s) => (s === current ? sample : s));
    const colorIndex = colorsRef.current.get(current);
    if (colorIndex !== undefined && !colorsRef.current.has(sample)) {
      colorsRef.current.set(sample, colorIndex);
    }
    if (index >= base) {
      setExtras((xs) => xs.map((s, i) => (i === index - base ? sample : s)));
      return;
    }
    applyGrid(renameRow(grid, index, sample));
  };

  const handleBank = (bank: string) => {
    const name = activeRef.current;
    if (!name) return;
    api.code.write(setBank(api.code, api.getCode(), name, bank));
  };

  // ─── Canvas events ──────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !displayed) return;
    const hit = hitTest(canvas, displayed, e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    handleCell(hit, e.button);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !displayed) return;
    setHover(hitTest(canvas, displayed, e.clientX, e.clientY));
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const complex = active !== null && grid === null;
  const rows = displayed?.rows ?? [];
  const activeBank = clips.find((c) => c.name === active)?.bank ?? null;

  return (
    <div className={styles.panel}>
      <DrumGridToolbar
        clips={clips}
        active={active}
        grid={grid}
        bank={activeBank}
        onSelectClip={(name) => {
          setActiveClip(name);
          refresh();
        }}
        onStepCount={(n) => grid && applyGrid(setStepCount(grid, n))}
        onToggleForm={() =>
          grid && applyGrid(setForm(grid, grid.form === 'merged' ? 'split' : 'merged'))
        }
        onAddRow={handleAddRow}
        onSetBank={handleBank}
        stepChoices={STEP_CHOICES}
        sampleSuggestions={DRUM_SAMPLES}
        bankChoices={DRUM_BANKS}
      />

      {clips.length === 0 && (
        <div className={styles.empty}>Aucun clip — crée un clip dans la Session.</div>
      )}

      {complex && (
        <div className={styles.infoBanner}>
          Contenu de « {active} » trop complexe pour la grille — édite-le dans le Code Editor.
        </div>
      )}

      {displayed && (
        <div className={styles.gridArea}>
          <div className={styles.labels}>
            {rows.map((row, i) => (
              <div key={`${row.sample}-${i}`} className={styles.labelRow}>
                <span className={styles.dot} style={{ background: rowColors[i] }} />
                {editing === i ? (
                  <input
                    className={styles.labelEdit}
                    defaultValue={row.sample}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => handleRename(i, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        // Revert before blurring so the blur commit is a no-op.
                        e.currentTarget.value = row.sample;
                        e.currentTarget.blur();
                      }
                    }}
                  />
                ) : (
                  <span
                    className={styles.labelName}
                    title={`${row.sample} — double-clic pour renommer`}
                    onDoubleClick={() => setEditing(i)}
                  >
                    {row.sample}
                  </span>
                )}
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemoveRow(i)}
                  title="Supprimer la ligne"
                >
                  ×
                </button>
              </div>
            ))}
            {rows.length === 0 && (
              <div className={styles.noRows}>Ajoute un sample →</div>
            )}
          </div>
          <div className={styles.canvasWrap}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              style={{ height: rows.length * ROW_HEIGHT }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHover(null)}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </div>
      )}

      {displayed && (
        <div className={styles.hint}>
          clic = activer un pas · clic droit = subdivisions ([hh hh])
        </div>
      )}
    </div>
  );
}
