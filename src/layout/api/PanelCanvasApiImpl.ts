import type { CanvasSet, CanvasSurface, PanelCanvasApi } from './PanelCanvasApi';

class CanvasSetImpl implements CanvasSet {
  private readonly canvases = new Map<string, HTMLCanvasElement>();
  // Memoized per key so the callback ref keeps a stable identity across
  // renders (otherwise React detaches/reattaches on every render).
  private readonly refs = new Map<string, (el: HTMLCanvasElement | null) => void>();

  constructor(private readonly onRelease?: (key: string) => void) {}

  ref(key: string): (el: HTMLCanvasElement | null) => void {
    let cb = this.refs.get(key);
    if (!cb) {
      cb = (el) => {
        if (el) {
          this.canvases.set(key, el);
        } else {
          this.canvases.delete(key);
          this.onRelease?.(key);
        }
      };
      this.refs.set(key, cb);
    }
    return cb;
  }

  get(key: string): HTMLCanvasElement | undefined {
    return this.canvases.get(key);
  }

  forEach(cb: (canvas: HTMLCanvasElement, key: string) => void): void {
    for (const [key, canvas] of this.canvases) cb(canvas, key);
  }

  clear(): void {
    this.canvases.clear();
    this.refs.clear();
  }
}

class PanelCanvasApiImpl implements PanelCanvasApi {
  surface(canvas: HTMLCanvasElement, opts?: { clear?: boolean }): CanvasSurface | null {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (opts?.clear !== false) ctx.clearRect(0, 0, width, height);
    return { ctx, width, height, dpr };
  }

  loop(draw: (dtMs: number, nowMs: number) => void): () => void {
    let raf = 0;
    let prev = performance.now();
    const frame = (now: number) => {
      const dt = now - prev;
      prev = now;
      draw(dt, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }

  createSet(onRelease?: (key: string) => void): CanvasSet {
    return new CanvasSetImpl(onRelease);
  }
}

export function createCanvasApi(): PanelCanvasApi {
  return new PanelCanvasApiImpl();
}
