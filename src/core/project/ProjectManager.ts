/** Orchestrates New/Open/Save/Save As and the last-project boot flow, on top
 *  of the `window.dualDesktop` bridge and `syncController` (the sole path
 *  used to apply a loaded project's code and trigger re-evaluation). */
export interface ProjectManager {
  newProject(): Promise<void>;
  openProject(): Promise<void>;
  /** Resolves to whether a file was actually written — false on a cancelled
   *  Save As or a write failure, distinct from "nothing to do". Callers that
   *  gate something on the save actually having happened (e.g. the window
   *  close flow) must check this rather than assume success. */
  save(): Promise<boolean>;
  saveAs(): Promise<boolean>;
  /** Resets to a fresh untitled empty project without touching the
   *  remembered last-project path — used to boot the app into a blank
   *  canvas by default (the last project is opened on demand instead, via
   *  `openLastProject`). */
  initBlankProject(): void;
  /** Loads the remembered last project, if any, with the same dirty-confirm
   *  gating and success/failure notifications as `openProject`. */
  openLastProject(): Promise<void>;
  /** Re-reads the current project's file from disk and applies it — used
   *  after a Git Pull, whose changes land on disk without going through
   *  `writeFile`/`syncController`, so the in-memory code would otherwise go
   *  stale and get overwritten on the next Save/Commit. Same dirty-confirm
   *  gating as `openProject`. No-op if no project is open. */
  reloadCurrentProject(): Promise<void>;
}
