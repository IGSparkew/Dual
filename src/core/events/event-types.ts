import type { Hap } from '../types/hap';
import type { TransportState } from '../types/transport';
import type { FxChainEntry } from '../types/fx';

export interface EventMap {
  'haps:updated': { haps: Hap[]; source: string };
  'code:changed': { code: string; origin: 'user_edit' | 'ui_action' };
  'clip:selected': { clipId: string; patternCode: string };
  'note:created': { note: unknown; begin: number; end: number };
  'note:deleted': { note: unknown; begin: number; end: number };
  'transport:state': TransportState;
  'mixer:changed': { clipId: string; param: string; value: number };
  'fx:changed': { clipId: string; fxChain: FxChainEntry[] };
  'layout:changed': { layout: unknown };
  'sample:dropped': { samplePath: string; targetClipId: string };
}

export type EventType = keyof EventMap;
