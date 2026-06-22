export type SyncOrigin = 'user_edit' | 'ui_action';

export interface SyncController {
  /**
   * Notify the controller that the code changed.
   * - 'user_edit': debounced evaluation (avoids firing on every keystroke)
   * - 'ui_action': immediate evaluation with re-entry lock (avoids code→UI→code loops)
   */
  notify(origin: SyncOrigin, code: string): void;

  /** True while a ui_action evaluation is in progress — code editor must not re-trigger. */
  isLocked(): boolean;

  /** Cancel any pending debounce and release the lock. */
  dispose(): void;
}
