import type { Hap } from '@core/types/hap';
import type { AppState, Notification } from '@core/state/store';
import type { EventMap, EventType } from '@core/events/event-types';

export type { Notification };
export type NotificationType = Notification['type'];

export interface PanelApi {
  readonly panelId: string;
  subscribeToHaps(callback: (haps: Hap[]) => void): () => void;
  getCode(): string;
  modifyCode(transform: (code: string) => string): void;
  getState<T>(selector: (state: AppState) => T): T;
  emit<K extends EventType>(eventType: K, payload: EventMap[K]): void;
  on<K extends EventType>(
    eventType: K,
    handler: (payload: EventMap[K]) => void,
  ): () => void;
  showNotification(message: string, type?: NotificationType): void;
}
