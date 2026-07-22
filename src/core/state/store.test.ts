/**
 * Tests for the `layoutPanelOverrides` slice of the Zustand store
 * (`setLayoutPanelOverride` / `clearLayoutPanelOverride`).
 *
 * The real `useStore` singleton is used directly (same pattern as
 * `ProjectManagerImpl.test.ts`): its full state is snapshotted once and
 * restored via `useStore.setState(INITIAL_STATE, true)` before every test so
 * that no test leaks overrides into the next one.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './store';

const INITIAL_STATE = useStore.getState();

describe('store — layoutPanelOverrides', () => {
  beforeEach(() => {
    useStore.setState(INITIAL_STATE, true);
  });

  it('starts empty', () => {
    expect(useStore.getState().layoutPanelOverrides).toEqual({});
  });

  it('setLayoutPanelOverride adds a new key', () => {
    useStore.getState().setLayoutPanelOverride('minimal:0.1', 'mixer');

    expect(useStore.getState().layoutPanelOverrides).toEqual({
      'minimal:0.1': 'mixer',
    });
  });

  it('setLayoutPanelOverride overwrites an existing key without touching others', () => {
    useStore.getState().setLayoutPanelOverride('minimal:0.1', 'mixer');
    useStore.getState().setLayoutPanelOverride('minimal:root', 'session');

    useStore.getState().setLayoutPanelOverride('minimal:0.1', 'piano-roll');

    expect(useStore.getState().layoutPanelOverrides).toEqual({
      'minimal:0.1': 'piano-roll',
      'minimal:root': 'session',
    });
  });

  it('clearLayoutPanelOverride removes only the targeted key', () => {
    useStore.getState().setLayoutPanelOverride('minimal:0.1', 'mixer');
    useStore.getState().setLayoutPanelOverride('minimal:root', 'session');
    useStore.getState().setLayoutPanelOverride('arranger:0.0', 'drum-grid');

    useStore.getState().clearLayoutPanelOverride('minimal:0.1');

    expect(useStore.getState().layoutPanelOverrides).toEqual({
      'minimal:root': 'session',
      'arranger:0.0': 'drum-grid',
    });
  });

  it('clearLayoutPanelOverride on a key that was never set is a safe no-op', () => {
    useStore.getState().setLayoutPanelOverride('minimal:root', 'session');

    useStore.getState().clearLayoutPanelOverride('does-not-exist');

    expect(useStore.getState().layoutPanelOverrides).toEqual({
      'minimal:root': 'session',
    });
  });

  it('clearLayoutPanelOverride on the only key empties the map back to {}', () => {
    useStore.getState().setLayoutPanelOverride('minimal:root', 'session');

    useStore.getState().clearLayoutPanelOverride('minimal:root');

    expect(useStore.getState().layoutPanelOverrides).toEqual({});
  });

  it('different layoutId with the same slotKey are independent (key is the composite string)', () => {
    useStore.getState().setLayoutPanelOverride('minimal:root', 'session');
    useStore.getState().setLayoutPanelOverride('arranger:root', 'drum-grid');

    useStore.getState().clearLayoutPanelOverride('minimal:root');

    expect(useStore.getState().layoutPanelOverrides).toEqual({
      'arranger:root': 'drum-grid',
    });
  });
});
