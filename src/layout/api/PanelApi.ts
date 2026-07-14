import type { Hap } from '@core/types/hap';
import type { TransportState } from '@core/types/transport';
import type { AppState, Notification } from '@core/state/store';
import type { EventMap, EventType } from '@core/events/event-types';
import type {
  CallArg,
  ChainLink,
  Decl,
  DollarExpr,
  ExprQuery,
  GraphError,
  OutputRegion,
} from '@core/interpreter/CodeRegion';
import type { PanelCanvasApi } from './PanelCanvasApi';

export type { Notification };
export type { CanvasSet, CanvasSurface, PanelCanvasApi } from './PanelCanvasApi';
export type NotificationType = Notification['type'];

/**
 * Region-scoped access to the document. Built-in panels may import the
 * `codeRegion` service directly; the module contract goes through this façade
 * only. It is the future permission boundary (`code:read` / `code:write`).
 *
 * The API reports structure (declarations, calls, output), the module decides
 * meaning. It never names a consumer concept ("clip", "gate", "group").
 */
export interface PanelCodeApi {
  // ── Reads (pure) — code:read ───────────────────────────────────────────────

  /** All top-level declarations in source order, tagged by `declKind`/
   *  `initKind`. null on parse error. */
  list(code: string): Decl[] | null;
  /** Classify an arbitrary expression source. */
  readExpr(source: string): ExprQuery | null;
  /** Locate the live output region (`$:` block or terminal expression). */
  locateOutput(code: string): OutputRegion;
  /** Exact source of the output region, null when the document has none. */
  outputSource(code: string): string | null;
  /** Expressions projected by the `$:` block, each tagged `isIdentifier`. */
  dollarExprs(code: string): DollarExpr[];
  /** Arguments of the call that initializes `name` (null if not a call). */
  callArgs(code: string, name: string): CallArg[] | null;
  /** Arguments of the first top-level bare call `calleeName(...)` (null when
   *  absent). Generic over any top-level function — setcps, samples, … */
  leadingCallArgs(code: string, calleeName: string): CallArg[] | null;
  /** Method calls chained on `name`'s initializer, in source order, excluding
   *  the root constructor. null when the decl is absent or not a call. */
  chainCalls(code: string, name: string): ChainLink[] | null;
  /** Validate the dependency graph (`[]` = OK). */
  validateGraph(decls: Decl[]): GraphError[];

  // ── Transforms (pure, code → code) — code:write ────────────────────────────

  /** Insert a declaration statement just before the output, on its own line. */
  insertDecl(code: string, declText: string): string;
  /** Remove a declaration by name, with its trailing newlines. */
  removeDecl(code: string, name: string): string;
  /** Replace a declaration's initializer in place (splices `initStart..initEnd`). */
  setInit(code: string, name: string, source: string): string;
  /** Set the args of the first top-level bare call `calleeName(...)` in place, or
   *  insert `calleeName(args);` as the document's first line when absent. */
  setLeadingCall(code: string, calleeName: string, args: string): string;
  /** Replace the output region (or add one if absent). */
  setOutput(code: string, text: string): string;
  /** Remove the output region. */
  removeOutput(code: string): string;

  // ── Raw escape hatch — code:write:raw, built-in only ───────────────────────

  /** Pure string splice — does not apply; returns the new text. */
  spliceSpan(code: string, start: number, end: number, replacement: string): string;

  // ── Commit — the single write engine ───────────────────────────────────────

  /** Apply new document text and re-evaluate audio (ui_action). */
  write(code: string): void;
}

export interface PanelApi {
  readonly panelId: string;
  readonly code: PanelCodeApi;
  /** Canvas toolkit: DPR surfaces, rAF loop, keyed canvas collections. */
  readonly canvas: PanelCanvasApi;
  subscribeToHaps(callback: (haps: Hap[]) => void): () => void;
  /** Names of the sounds registered in superdough's sound map, sorted,
   *  `_`-keys excluded. Keys are LOWERCASE — packs load after mount, so pair
   *  this initial read with `subscribeToSounds`. */
  getSounds(): string[];
  /** Subscribe to sound-map changes (packs loading, user samples). Coalesced;
   *  receives the same list as `getSounds()`, replayed once on subscribe (no
   *  gap with an initial read). Returns an unsubscribe. */
  subscribeToSounds(callback: (names: string[]) => void): () => void;
  getCode(): string;
  modifyCode(transform: (code: string) => string): void;
  getState<T>(selector: (state: AppState) => T): T;
  /** Live transport snapshot (audio-clock position) — unlike the store copy,
   *  `position` advances while playing. Poll it from animation loops. */
  getTransport(): TransportState;
  emit<K extends EventType>(eventType: K, payload: EventMap[K]): void;
  on<K extends EventType>(
    eventType: K,
    handler: (payload: EventMap[K]) => void,
  ): () => void;
  showNotification(message: string, type?: NotificationType): void;
}
