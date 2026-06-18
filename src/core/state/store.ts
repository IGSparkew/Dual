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

export interface AppState {
  transport: TransportState;
  tracks: Track[];
  activeCode: string;
  haps: Hap[];
  engineStatus: EngineStatus;
  notifications: Notification[];

  setTransport: (state: Partial<TransportState>) => void;
  setActiveCode: (code: string) => void;
  setHaps: (haps: Hap[]) => void;
  setEngineStatus: (status: EngineStatus) => void;
  addNotification: (message: string, type?: Notification['type']) => void;
  removeNotification: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  transport: { status: 'stopped', bpm: 120, position: 0 },
  tracks: [],
  activeCode: '',
  haps: [],
  engineStatus: 'init',
  notifications: [],

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
}));
