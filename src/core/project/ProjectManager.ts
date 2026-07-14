/** Orchestrates New/Open/Save/Save As and the last-project boot flow, on top
 *  of the `window.dualDesktop` bridge and `syncController` (the sole path
 *  used to apply a loaded project's code and trigger re-evaluation). */
export interface ProjectManager {
  newProject(): Promise<void>;
  openProject(): Promise<void>;
  save(): Promise<void>;
  saveAs(): Promise<void>;
  loadLastProjectOnBoot(): Promise<void>;
}
