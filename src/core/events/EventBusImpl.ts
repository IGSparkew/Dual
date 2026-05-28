import type { EventBus } from './EventBus';
import type { EventMap, EventType } from './event-types';

type Handler<T> = (payload: T) => void;

class EventBusImpl implements EventBus {
  private listeners = new Map<EventType, Set<Handler<unknown>>>();

  emit<T extends EventType>(event: T, payload: EventMap[T]): void {
    this.listeners.get(event)?.forEach((h) => h(payload));
  }

  on<T extends EventType>(event: T, handler: Handler<EventMap[T]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  off<T extends EventType>(event: T, handler: Handler<EventMap[T]>): void {
    this.listeners.get(event)?.delete(handler as Handler<unknown>);
  }
}

export const eventBus: EventBus = new EventBusImpl();
