/**
 * Canvas toolkit exposed to panels as `api.canvas` — the boilerplate every
 * canvas-based module repeats: DPR-aware backing-store sizing, a single rAF
 * loop with frame timing, and keyed canvas collections for list UIs (one
 * canvas per row/strip).
 *
 * Pure DOM/canvas utilities: no React, no store, no drawing vocabulary. A
 * module keeps its actual rendering in its `*-renderer.ts` files (which draw
 * over a `CanvasSurface`) and its hit-testing in `*-interaction.ts`.
 */

/** A canvas ready to draw on: backing store fitted, context cleared. */
export interface CanvasSurface {
  ctx: CanvasRenderingContext2D;
  /** Backing-store size in device pixels (CSS size × devicePixelRatio). */
  width: number;
  height: number;
  dpr: number;
}

/**
 * Keyed canvas collection driven by React callback refs. `ref(key)` is stable
 * per key, so it can be passed straight as a `ref`/`onCanvas` prop without
 * re-registering on every render.
 */
export interface CanvasSet {
  /** Callback ref for `key` — registers on mount, releases on unmount. */
  ref(key: string): (el: HTMLCanvasElement | null) => void;
  get(key: string): HTMLCanvasElement | undefined;
  forEach(cb: (canvas: HTMLCanvasElement, key: string) => void): void;
  clear(): void;
}

export interface PanelCanvasApi {
  /**
   * Fit the canvas backing store to its CSS size × devicePixelRatio and return
   * a 2D context (cleared unless `clear: false`). Call it at the top of every
   * frame: resizing is a no-op when the element size has not changed. Returns
   * null when the 2D context is unavailable.
   */
  surface(canvas: HTMLCanvasElement, opts?: { clear?: boolean }): CanvasSurface | null;

  /**
   * Run `draw` on every animation frame with the milliseconds elapsed since
   * the previous frame. One loop per concern — a module with many canvases
   * drives them all from a single loop. Returns the dispose function.
   */
  loop(draw: (dtMs: number, nowMs: number) => void): () => void;

  /**
   * Create a keyed canvas collection for one-canvas-per-item UIs.
   * `onRelease(key)` fires when an item's canvas unmounts — the place to drop
   * per-item drawing state (envelopes, caches).
   */
  createSet(onRelease?: (key: string) => void): CanvasSet;
}
