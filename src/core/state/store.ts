import { create } from 'zustand';
import type { TransportState } from '../types/transport';
import type { Track } from '../types/clip';
import type { Hap } from '../types/hap';
import { EngineStatus } from '@core/types/engineStatus';

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

/** Which output the document currently projects. Lives in state, never in the
 *  document: the `.strudel` only ever holds the active mode's output. */
export type OutputMode = 'session' | 'arrangement';

export interface AppState {
  transport: TransportState;
  tracks: Track[];
  activeCode: string;
  haps: Hap[];
  engineStatus: EngineStatus;
  notifications: Notification[];
  outputMode: OutputMode;
  /** Last known `arrange(...)` source — dormant memory across a mode round-trip
   *  (the `$:` block is trivially regenerable from the grid, the arrange is not). */
  arrangementCode: string;
  /** Absolute path of the loaded `.strudel` project file, or null when unsaved. */
  currentProjectPath: string | null;
  projectName: string;
  isDirty: boolean;

  setTransport: (state: Partial<TransportState>) => void;
  setActiveCode: (code: string) => void;
  setHaps: (haps: Hap[]) => void;
  setEngineStatus: (status: EngineStatus) => void;
  addNotification: (message: string, type?: Notification['type']) => void;
  removeNotification: (id: string) => void;
  setOutputMode: (mode: OutputMode) => void;
  setArrangementCode: (code: string) => void;
  setCurrentProjectPath: (path: string | null) => void;
  setProjectName: (name: string) => void;
  setDirty: (dirty: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  transport: { status: 'stopped', bpm: 120, position: 0 },
  tracks: [],
  activeCode: '',
  haps: [],
  engineStatus: 'init',
  notifications: [],
  outputMode: 'session',
  arrangementCode: '',
  currentProjectPath: null,
  projectName: 'Untitled',
  isDirty: false,

  setTransport: (partial) =>
    set((s) => ({ transport: { ...s.transport, ...partial } })),
  setActiveCode: (code) => set({ activeCode: code }),
  setHaps: (haps) => set({ haps }),
  setEngineStatus: (status) => set({ engineStatus: status }),
  addNotification: (message, type = 'info') =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { id: `${Date.now()}-${Math.random()}`, message, type },
      ],
    })),
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  setOutputMode: (mode) => set({ outputMode: mode }),
  setArrangementCode: (code) => set({ arrangementCode: code }),
  setCurrentProjectPath: (path) => set({ currentProjectPath: path }),
  setProjectName: (name) => set({ projectName: name }),
  setDirty: (dirty) => set({ isDirty: dirty }),
}));
