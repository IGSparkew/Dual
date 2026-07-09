import { Layers } from 'lucide-react';
import type { Strip } from '../mixer';
import { GAIN_DEFAULT, PAN_DEFAULT, formatNum } from '../mixer';
import { Fader } from './Fader';
import { PanKnob } from './PanKnob';
import { VuMeter } from './VuMeter';
import styles from '../MixerModule.module.css';

/** Badges shown before folding the rest into a `+n` counter. */
const MAX_BADGES = 3;

interface ChannelStripProps {
  strip: Strip;
  /** Chained method names on the clip, minus gain/pan (FX badges). */
  badges: string[];
  soloed: boolean;
  highlighted: boolean;
  disabled: boolean;
  onGain: (strip: Strip, value: number) => void;
  onPan: (strip: Strip, value: number) => void;
  onMute: (strip: Strip) => void;
  onSolo: (strip: Strip) => void;
  /** Click on the badge row — selects the clip (FX Rack focus). */
  onFxClick: (strip: Strip) => void;
  /** Stable callback ref from the module's CanvasSet. */
  onCanvas: (el: HTMLCanvasElement | null) => void;
}

/** One mixer channel: pan knob, VU + fader, gain readout, mute/solo, FX
 *  badges, name. */
export function ChannelStrip({
  strip,
  badges,
  soloed,
  highlighted,
  disabled,
  onGain,
  onPan,
  onMute,
  onSolo,
  onFxClick,
  onCanvas,
}: ChannelStripProps) {
  const gain = strip.gain ?? GAIN_DEFAULT;
  const pan = strip.pan ?? PAN_DEFAULT;

  return (
    <div className={styles.strip} data-highlighted={highlighted || undefined}>
      <PanKnob value={pan} disabled={disabled} onCommit={(v) => onPan(strip, v)} />

      <div className={styles.stripMeterRow}>
        <VuMeter onCanvas={onCanvas} />
        <Fader
          value={gain}
          min={0}
          max={2}
          resetValue={GAIN_DEFAULT}
          disabled={disabled}
          onCommit={(v) => onGain(strip, v)}
        />
      </div>

      <span className={styles.stripGain}>{formatNum(gain)}</span>

      <div className={styles.stripButtons}>
        <button
          className={styles.stripBtn}
          data-active={strip.isMuted || undefined}
          data-kind="mute"
          disabled={disabled}
          onClick={() => onMute(strip)}
          title="Mute"
        >
          M
        </button>
        <button
          className={styles.stripBtn}
          data-active={soloed || undefined}
          data-kind="solo"
          disabled={disabled}
          onClick={() => onSolo(strip)}
          title="Solo"
        >
          S
        </button>
      </div>

      {badges.length > 0 && (
        <div
          className={styles.stripFx}
          role="button"
          tabIndex={0}
          title={`FX : ${badges.join(', ')} — clic pour ouvrir dans le FX Rack`}
          onClick={() => onFxClick(strip)}
          onKeyDown={(e) => e.key === 'Enter' && onFxClick(strip)}
        >
          {badges.slice(0, MAX_BADGES).map((method) => (
            <span key={method} className={styles.stripFxBadge}>
              {method}
            </span>
          ))}
          {badges.length > MAX_BADGES && (
            <span className={styles.stripFxBadge} data-more>
              +{badges.length - MAX_BADGES}
            </span>
          )}
        </div>
      )}

      <div className={styles.stripName} title={strip.name}>
        {strip.isGroup && <Layers size={9} className={styles.stripGroupBadge} />}
        <span>{strip.name}</span>
      </div>
    </div>
  );
}
