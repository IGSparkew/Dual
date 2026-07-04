import type { PanelApi, NotificationType, PanelCodeApi } from './PanelApi';
import type { Hap } from '@core/types/hap';
import type { TransportState } from '@core/types/transport';
import type { AppState } from '@core/state/store';
import { useStore } from '@core/state/store';
import { eventBus } from '@core/events/EventBusImpl';
import type { EventMap, EventType } from '@core/events/event-types';
import { codeRegion } from '@core/interpreter/impl/CodeRegionImpl';
import { syncController } from '@core/interpreter/impl/SyncControllerImpl';
import { scheduler } from '@core/engine/impl/SchedulerImpl';

/** Façade over the CodeRegion service for a single panel. */
const codeApi: PanelCodeApi = {
  // Reads
  list: (code) => codeRegion.list(code),
  readExpr: (source) => codeRegion.readExpr(source),
  locateOutput: (code) => codeRegion.locateOutput(code),
  outputSource: (code) => codeRegion.outputSource(code),
  dollarExprs: (code) => codeRegion.dollarExprs(code),
  callArgs: (code, name) => codeRegion.callArgs(code, name),
  validateGraph: (decls) => codeRegion.validateGraph(decls),
  // Transforms
  insertDecl: (code, declText) => codeRegion.insertDecl(code, declText),
  removeDecl: (code, name) => codeRegion.removeDecl(code, name),
  setInit: (code, name, source) => codeRegion.setInit(code, name, source),
  setOutput: (code, text) => codeRegion.setOutput(code, text),
  removeOutput: (code) => codeRegion.removeOutput(code),
  // Raw
  spliceSpan: (code, start, end, replacement) =>
    codeRegion.spliceSpan(code, start, end, replacement),
  // Commit — a ui_action notify already updates the store, mirrors the editor
  // and re-evaluates audio (SyncControllerImpl._evaluateImmediate).
  write: (code) => syncController.notify('ui_action', code),
};

class PanelApiImpl implements PanelApi {
  readonly code = codeApi;

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

  getTransport(): TransportState {
    return scheduler.getState();
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
