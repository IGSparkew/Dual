import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import type { GraphError } from '@core/interpreter/CodeRegion';
import type { NormalizedHap } from '@core/types/hap';
import {
  deriveActivity,
  deriveStrips,
  engageSolo,
  releaseSolo,
  setGain,
  setPan,
  toggleMute,
  type Activity,
  type PreSolo,
  type Strip,
} from './mixer';
import { ChannelStrip } from './components/ChannelStrip';
import {
  createEnvelope,
  drawVuMeter,
  stepEnvelope,
  type VuEnvelope,
} from './components/vu-meter-renderer';
import styles from './MixerModule.module.css';

/**
 * Mixer — channel strips over the named-clip convention.
 *
 * Each strip drives the clip's config consts (`NAME_GAIN`, `NAME_ON`,
 * `NAME_PAN`) through in-place splices; the mixer never touches the clip's
 * content or the output region. Continuous gestures (fader, knob) only write
 * on commit. Solo is UI state: it rewrites the gates in one write and restores
 * the exact pre-solo snapshot on release.
 */
export function MixerModule({ api }: PanelProps) {
  const [strips, setStrips] = useState<Strip[]>([]);
  const [errors, setErrors] = useState<GraphError[]>([]);
  const [solo, setSoloState] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const stripsRef = useRef<Strip[]>([]);
  const soloRef = useRef<Set<string>>(new Set());
  const preSoloRef = useRef<PreSolo | null>(null);
  const hapsRef = useRef<NormalizedHap[]>([]);
  const activityRef = useRef<Activity>({});
  const canvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const envelopesRef = useRef<Map<string, VuEnvelope>>(new Map());

  const frozen = errors.length > 0;

  const setSolo = (next: Set<string>) => {
    soloRef.current = next;
    setSoloState(next);
  };

  /** Re-derive the whole model from the current document. */
  const refresh = useCallback(() => {
    const code = api.getCode();
    const defs = api.code.list(code);
    if (defs === null) return; // parse error — keep the current view
    const raw = deriveStrips(api.code, defs);
    stripsRef.current = raw;
    setStrips(raw);
    setErrors(api.code.validateGraph(defs));
    activityRef.current = deriveActivity(hapsRef.current, raw);
  }, [api]);

  useEffect(() => {
    refresh();
    return api.on('code:changed', ({ origin }) => {
      // Refresh on every document change: hand edits AND writes from other
      // panels (session adding a clip, arrangement edits, ...). Refresh is a
      // pure derivation, so reacting to our own writes is harmless.
      if (origin === 'user_edit' && soloRef.current.size > 0) {
        // Hand edit while soloing: the edited document is the truth — drop the
        // solo without writing anything back.
        setSolo(new Set());
        preSoloRef.current = null;
        api.showNotification('Solo annulé — code modifié à la main', 'warning');
      }
      refresh();
    });
  }, [api, refresh]);

  // Highlight the strip of the clip selected in the session grid.
  useEffect(() => api.on('clip:selected', ({ clipId }) => setHighlighted(clipId)), [api]);

  // Haps → per-strip activity buckets (read by the VU loop).
  useEffect(
    () =>
      api.subscribeToHaps((haps) => {
        hapsRef.current = haps as unknown as NormalizedHap[];
        activityRef.current = deriveActivity(hapsRef.current, stripsRef.current);
      }),
    [api],
  );

  // Panel unmount with an active solo: restore the pre-solo gates so the
  // document is not left with phantom mutes.
  useEffect(
    () => () => {
      if (soloRef.current.size === 0 || !preSoloRef.current) return;
      const code = api.getCode();
      const defs = api.code.list(code);
      if (!defs) return;
      const current = deriveStrips(api.code, defs);
      api.code.write(releaseSolo(api.code, code, current, preSoloRef.current));
    },
    [api],
  );

  // ─── VU loop (single rAF, draws every strip canvas via refs) ────────────────

  useEffect(() => {
    let raf = 0;
    let prevTime = performance.now();

    const loop = (now: number) => {
      // Follow the transport's live position (audio clock) so the meter runs
      // exactly while sound plays and stays in phase with the pattern,
      // including pause/resume and BPM changes. 4 beats = 1 cycle.
      const { status, position } = api.getTransport();
      const dt = now - prevTime;
      prevTime = now;
      const phase = status === 'playing' ? ((position / 4) % 1 + 1) % 1 : 0;

      for (const [name, canvas] of canvasesRef.current) {
        let env = envelopesRef.current.get(name);
        if (!env) {
          env = createEnvelope();
          envelopesRef.current.set(name, env);
        }
        const buckets = activityRef.current[name];
        const playing = status === 'playing' && !!buckets && buckets.length > 0;
        const target = playing
          ? buckets![Math.floor(phase * buckets!.length) % buckets!.length]
          : 0;
        stepEnvelope(env, target, dt);
        drawVuMeter(canvas, env);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [api]);

  const handleCanvas = (name: string, el: HTMLCanvasElement | null) => {
    if (el) canvasesRef.current.set(name, el);
    else {
      canvasesRef.current.delete(name);
      envelopesRef.current.delete(name);
    }
  };

  // ─── Commits (one write each) ───────────────────────────────────────────────

  /** Apply new document text (re-evaluates audio) and re-derive the model. */
  const apply = (code: string) => {
    api.code.write(code);
    refresh();
  };

  const handleGain = (strip: Strip, value: number) => {
    if (frozen) return;
    apply(setGain(api.code, api.getCode(), strip, value));
    api.emit('mixer:changed', { clipId: strip.name, param: 'gain', value });
  };

  const handlePan = (strip: Strip, value: number) => {
    if (frozen) return;
    apply(setPan(api.code, api.getCode(), strip, value));
    api.emit('mixer:changed', { clipId: strip.name, param: 'pan', value });
  };

  const handleMute = (strip: Strip) => {
    if (frozen) return;
    apply(toggleMute(api.code, api.getCode(), strip));
    api.emit('mixer:changed', {
      clipId: strip.name,
      param: 'mute',
      value: strip.isMuted ? 0 : 1,
    });
  };

  const handleSolo = (strip: Strip) => {
    if (frozen) return;
    const next = new Set(soloRef.current);
    next.has(strip.name) ? next.delete(strip.name) : next.add(strip.name);

    const code = api.getCode();
    if (next.size === 0) {
      if (preSoloRef.current) {
        apply(releaseSolo(api.code, code, stripsRef.current, preSoloRef.current));
      }
      preSoloRef.current = null;
    } else {
      const result = engageSolo(api.code, code, stripsRef.current, next);
      // Keep the snapshot of the FIRST engagement — later toggles happen on an
      // already-soloed document and must not overwrite the true baseline.
      if (!preSoloRef.current) preSoloRef.current = result.preSolo;
      apply(result.code);
    }
    setSolo(next);
    api.emit('mixer:changed', {
      clipId: strip.name,
      param: 'solo',
      value: next.has(strip.name) ? 1 : 0,
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.panel}>
      {frozen && (
        <div className={styles.errorBanner} role="alert">
          <span className={styles.errorTitle}>Graphe invalide — panneau gelé</span>
          {errors.slice(0, 4).map((e, i) => (
            <span key={i} className={styles.errorLine}>
              {e.detail}
            </span>
          ))}
        </div>
      )}

      {strips.length === 0 && !frozen ? (
        <div className={styles.empty}>Aucun clip — crée un clip dans la Session.</div>
      ) : (
        <div className={styles.strips}>
          {strips.map((strip) => (
            <ChannelStrip
              key={strip.name}
              strip={strip}
              soloed={solo.has(strip.name)}
              highlighted={highlighted === strip.name}
              disabled={frozen}
              onGain={handleGain}
              onPan={handlePan}
              onMute={handleMute}
              onSolo={handleSolo}
              onCanvas={handleCanvas}
            />
          ))}
        </div>
      )}
    </div>
  );
}
