import type { PanelApi, NotificationType } from './PanelApi';
import type { Hap } from '@core/types/hap';
import type { AppState } from '@core/state/store';
import { useStore } from '@core/state/store';
import { eventBus } from '@core/events/EventBusImpl';
import type { EventMap, EventType } from '@core/events/event-types';

class PanelApiImpl implements PanelApi {
  constructor(readonly panelId: string) {}

  subscribeToHaps(callback: (haps: Hap[]) => void): () => void {
    return eventBus.on('haps:updated', ({ haps }) => callback(haps));
  }

  getCode(): string {
    return useStore.getState().activeCode;
  }

  modifyCode(transform: (code: string) => string): void {
    const next = transform(useStore.getState().activeCode);
    useStore.getState().setActiveCode(next);
    eventBus.emit('code:changed', { code: next, origin: 'ui_action' });
  }

  getState<T>(selector: (state: AppState) => T): T {
    return selector(useStore.getState());
  }

  emit<K extends EventType>(eventType: K, payload: EventMap[K]): void {
    eventBus.emit(eventType, payload);
  }

  on<K extends EventType>(
    eventType: K,
    handler: (payload: EventMap[K]) => void,
  ): () => void {
    return eventBus.on(eventType, handler);
  }

  showNotification(message: string, type: NotificationType = 'info'): void {
    useStore.getState().addNotification(message, type);
  }
}

export function createPanelApi(panelId: string): PanelApi {
  return new PanelApiImpl(panelId);
}
