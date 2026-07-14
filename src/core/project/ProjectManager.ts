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
  loadLastProjectOnBoot(): Promise<void>;
}
