import { eventBus } from '@core/events/EventBusImpl';
import { useStore } from '@core/state/store';
import type { SyncController, SyncOrigin } from '../SyncController';
import { codeToVisual } from './CodeToVisualImpl';

const DEBOUNCE_MS = 400;

export class SyncControllerImpl implements SyncController {
  private _locked = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  notify(origin: SyncOrigin, code: string): void {
    if (origin === 'user_edit') {
      this._scheduleEvaluation(code);
    } else {
      this._evaluateImmediate(code);
    }
  }

  isLocked(): boolean {
    return this._locked;
  }

  dispose(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._locked = false;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private _scheduleEvaluation(code: string): void {
    // Drop keypresses that arrive while a ui_action is running
    if (this._locked) return;

    if (this._timer !== null) clearTimeout(this._timer);

    this._timer = setTimeout(() => {
      this._timer = null;
      this._runEvaluation(code, 'user_edit');
    }, DEBOUNCE_MS);
  }

  private _evaluateImmediate(code: string): void {
    // Cancel any pending user keystroke evaluation
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    this._locked = true;
    useStore.getState().setActiveCode(code);
    eventBus.emit('code:changed', { code, origin: 'ui_action' });

    this._runEvaluation(code, 'ui_action').finally(() => {
      this._locked = false;
    });
  }

  private async _runEvaluation(code: string, source: SyncOrigin): Promise<void> {
    const haps = await codeToVisual.evaluate(code);
    useStore.getState().setHaps(haps as never[]);
    eventBus.emit('haps:updated', { haps: haps as never[], source });
  }
}

export const syncController: SyncController = new SyncControllerImpl();
