import { create } from 'zustand';
import type { TransportState } from '../types/transport';
import type { Track } from '../types/clip';
import type { Hap } from '../types/hap';
import { EngineStatus } from '@core/types/engineStatus';

interface AppState {
  transport: TransportState;
  tracks: Track[];
  activeCode: string;
  haps: Hap[];
  engineStatus: EngineStatus;

  setTransport: (state: Partial<TransportState>) => void;
  setActiveCode: (code: string) => void;
  setHaps: (haps: Hap[]) => void;
  setEngineStatus: (status: EngineStatus) => void;
}

export const useStore = create<AppState>((set) => ({
  transport: { status: 'stopped', bpm: 120, position: 0 },
  tracks: [],
  activeCode: '',
  haps: [],
  engineStatus: "init",

  setTransport: (partial) =>
    set((s) => ({ transport: { ...s.transport, ...partial } })),
  setActiveCode: (code) => set({ activeCode: code }),
  setHaps: (haps) => set({ haps }),
  setEngineStatus: (status: EngineStatus) => set({engineStatus: status}),
}));
