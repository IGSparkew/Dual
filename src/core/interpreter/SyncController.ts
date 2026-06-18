export type SyncOrigin = 'user_edit' | 'ui_action';

export interface SyncController {
  notify(origin: SyncOrigin, code: string): void;
  isLocked(): boolean;
}
