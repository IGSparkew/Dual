import type { EventMap, EventType } from './event-types';

export interface EventBus {
  emit<T extends EventType>(event: T, payload: EventMap[T]): void;
  on<T extends EventType>(event: T, handler: (payload: EventMap[T]) => void): () => void;
  off<T extends EventType>(event: T, handler: (payload: EventMap[T]) => void): void;
}
