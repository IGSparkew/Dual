/**
 * Payload carried by a sound dragged out of the browser.
 *
 * Shared because two modules must agree on it without depending on each other:
 * the browser writes it into the DataTransfer, the session (and any module that
 * later accepts a drop) reads it back. Serialized as JSON under a private MIME
 * type so an unrelated drop (a file from the OS, selected text) is never
 * mistaken for one of ours.
 */
export interface SampleDragPayload {
  /** Sound-map key of the dragged sound (`bd`, `user_kick`, `user_kit_bd`). */
  soundName: string;
  /** Shape of what is behind the name — decides the code a drop generates. */
  kind: 'drum' | 'pitched';
  /** Bank prefix when the drag came from a bank group, else null. */
  bank: string | null;
  /** Label to seed a clip name from (bank name, or the sound's short name). */
  label: string;
}

/** Private MIME type — DataTransfer keys are strings, this one is ours. */
export const SAMPLE_DRAG_MIME = 'application/x-dual-sample';

export function writeSampleDrag(transfer: DataTransfer, payload: SampleDragPayload): void {
  transfer.setData(SAMPLE_DRAG_MIME, JSON.stringify(payload));
  // Plain-text fallback so dropping onto the code editor (or anything text)
  // yields something meaningful rather than nothing.
  transfer.setData('text/plain', payload.soundName);
  transfer.effectAllowed = 'copy';
}

/** The payload of a drag started by the browser, or null for anything else. */
export function readSampleDrag(transfer: DataTransfer): SampleDragPayload | null {
  const raw = transfer.getData(SAMPLE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const candidate = parsed as SampleDragPayload;
    return typeof candidate?.soundName === 'string' ? candidate : null;
  } catch {
    return null;
  }
}

/** True when a dragover carries one of our sounds — cheap enough for the event
 *  rate, and `getData` is unreadable during dragover (types are not). */
export function hasSampleDrag(transfer: DataTransfer): boolean {
  return Array.from(transfer.types).includes(SAMPLE_DRAG_MIME);
}
