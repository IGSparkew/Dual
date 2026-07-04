import type { Scheduler } from '../Scheduler';
import type { TransportState, PlaybackStatus } from '@core/types/transport';
import { useStore } from '@core/state/store';
import { strudelBridge } from './StrudelBridgeImpl';

export class SchedulerImpl implements Scheduler {
  private status: PlaybackStatus = 'stopped';
  private bpm: number = 120;
  private startTime: number = 0;
  private pausedAt: number = 0;

  play(): void {
    const strudel = strudelBridge.getScheduler();
    if (!strudel) return;

    if (this.status === 'paused') {
      strudel.start?.();
      this.startTime = this.getAudioTime() - this.pausedAt / (this.bpm / 60);
    } else {
      strudel.start?.();
      this.startTime = this.getAudioTime();
    }

    this.status = 'playing';
    this.syncStore();
  }

  pause(): void {
    const strudel = strudelBridge.getScheduler();
    if (!strudel || this.status !== 'playing') return;

    this.pausedAt = this.computePosition();
    strudel.pause?.() ?? strudel.stop?.();
    this.status = 'paused';
    this.syncStore();
  }

  stop(): void {
    const strudel = strudelBridge.getScheduler();
    if (!strudel) return;

    strudel.stop?.();
    this.status = 'stopped';
    this.pausedAt = 0;
    this.startTime = 0;
    this.syncStore();
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    const strudel = strudelBridge.getScheduler();
    // Strudel uses cps (cycles per second); 1 cycle = 1 beat at default tempo
    strudel?.setCps?.(bpm / 60 / 4);
    this.syncStore();
  }

  getState(): TransportState {
    return {
      status: this.status,
      bpm: this.bpm,
      position: this.status === 'playing' ? this.computePosition() : this.pausedAt,
    };
  }

  private computePosition(): number {
    if (this.status !== 'playing') return this.pausedAt;
    // Prefer the Strudel scheduler's own cycle clock (`now()`, in cycles) —
    // it is the clock the audio events are scheduled against, so consumers
    // (VU meters, playheads) stay in phase with what is audible. 1 cycle =
    // 4 beats (cps = bpm/60/4).
    const strudel = strudelBridge.getScheduler();
    const cycles = strudel?.now?.();
    if (typeof cycles === 'number' && Number.isFinite(cycles) && cycles > 0) {
      return cycles * 4;
    }
    const elapsed = this.getAudioTime() - this.startTime;
    return elapsed * (this.bpm / 60);
  }

  private getAudioTime(): number {
    const strudel = strudelBridge.getScheduler();
    // Use the scheduler's audio context time if available
    return strudel?.getAudioContext?.()?.currentTime ?? performance.now() / 1000;
  }

  private syncStore(): void {
    useStore.getState().setTransport({
      status: this.status,
      bpm: this.bpm,
      position: this.pausedAt,
    });
  }
}

export const scheduler: Scheduler = new SchedulerImpl();
