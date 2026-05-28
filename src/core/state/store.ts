import { create } from 'zustand';
import type { TransportState } from '../types/transport';
import type { Track } from '../types/clip';
import type { Hap } from '../types/hap';

interface AppState {
  transport: TransportState;
  tracks: Track[];
  activeCode: string;
  haps: Hap[];

  setTransport: (state: Partial<TransportState>) => void;
  setActiveCode: (code: string) => void;
  setHaps: (haps: Hap[]) => void;
}

export const useStore = create<AppState>((set) => ({
  transport: { status: 'stopped', bpm: 120, position: 0 },
  tracks: [],
  activeCode: '',
  haps: [],

  setTransport: (partial) =>
    set((s) => ({ transport: { ...s.transport, ...partial } })),
  setActiveCode: (code) => set({ activeCode: code }),
  setHaps: (haps) => set({ haps }),
}));
