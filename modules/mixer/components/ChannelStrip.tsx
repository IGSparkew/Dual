import { Layers } from 'lucide-react';
import type { Strip } from '../mixer';
import { GAIN_DEFAULT, PAN_DEFAULT, formatNum } from '../mixer';
import { Fader } from './Fader';
import { PanKnob } from './PanKnob';
import { VuMeter } from './VuMeter';
import styles from '../MixerModule.module.css';

interface ChannelStripProps {
  strip: Strip;
  soloed: boolean;
  highlighted: boolean;
  disabled: boolean;
  onGain: (strip: Strip, value: number) => void;
  onPan: (strip: Strip, value: number) => void;
  onMute: (strip: Strip) => void;
  onSolo: (strip: Strip) => void;
  onCanvas: (name: string, el: HTMLCanvasElement | null) => void;
}

/** One mixer channel: pan knob, VU + fader, gain readout, mute/solo, name. */
export function ChannelStrip({
  strip,
  soloed,
  highlighted,
  disabled,
  onGain,
  onPan,
  onMute,
  onSolo,
  onCanvas,
}: ChannelStripProps) {
  const gain = strip.gain ?? GAIN_DEFAULT;
  const pan = strip.pan ?? PAN_DEFAULT;

  return (
    <div className={styles.strip} data-highlighted={highlighted || undefined}>
      <PanKnob value={pan} disabled={disabled} onCommit={(v) => onPan(strip, v)} />

      <div className={styles.stripMeterRow}>
        <VuMeter onCanvas={(el) => onCanvas(strip.name, el)} />
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

      <div className={styles.stripName} title={strip.name}>
        {strip.isGroup && <Layers size={9} className={styles.stripGroupBadge} />}
        <span>{strip.name}</span>
      </div>
    </div>
  );
}
