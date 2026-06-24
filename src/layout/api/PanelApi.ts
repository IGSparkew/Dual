import type { Hap } from '@core/types/hap';
import type { AppState, Notification } from '@core/state/store';
import type { EventMap, EventType } from '@core/events/event-types';
import type {
  ClipDef,
  CodeQuery,
  GraphError,
  OutputRegion,
} from '@core/interpreter/CodeRegion';

export type { Notification };
export type NotificationType = Notification['type'];

/**
 * Region-scoped access to the document. Built-in panels may import the
 * `codeRegion` service directly; the module contract goes through this façade
 * only. It is the future permission boundary (`code:read` / `code:write`).
 */
export interface PanelCodeApi {
  /** Current document text. */
  current(): string;
  /** All `const` definitions in source order. null on parse error. */
  readClips(code: string): ClipDef[] | null;
  /** Parse a standalone expression into a query. */
  readExpr(source: string): CodeQuery | null;
  /** Locate the current output region (`$:` block or `arrange(...)`). */
  locateOutput(code: string): OutputRegion;
  /** Validate the dependency graph (`[]` = OK). */
  validateGraph(clips: ClipDef[]): GraphError[];
  /** Pure string splice — does not apply; returns the new text. */
  spliceSpan(code: string, start: number, end: number, replacement: string): string;
  /** Apply new document text and re-evaluate audio (ui_action). */
  write(code: string): void;
}

export interface PanelApi {
  readonly panelId: string;
  readonly code: PanelCodeApi;
  subscribeToHaps(callback: (haps: Hap[]) => void): () => void;
  getCode(): string;
  modifyCode(transform: (code: string) => string): void;
  getState<T>(selector: (state: AppState) => T): T;
  emit<K extends EventType>(eventType: K, payload: EventMap[K]): void;
  on<K extends EventType>(
    eventType: K,
    handler: (payload: EventMap[K]) => void,
  ): () => void;
  showNotification(message: string, type?: NotificationType): void;
}
