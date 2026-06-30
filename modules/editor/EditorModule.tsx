import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { useStore } from '@core/state/store';
import { eventBus } from '@core/events/EventBusImpl';
import { syncController } from '@core/interpreter/impl/SyncControllerImpl';
import type { PanelProps } from '@layout/registry/PanelRegistry';
import { strudelCompletions } from './strudel-completions';
import styles from './EditorModule.module.css';

export function EditorModule(_: PanelProps) {
  // Local state — NOT bound directly to the store to avoid re-render loops.
  // The store is only used to initialize and to receive external (ui_action) changes.
  const [localCode, setLocalCode] = useState(() => useStore.getState().activeCode);

  useEffect(() => {
    return eventBus.on('code:changed', ({ code, origin }) => {
      if (origin === 'ui_action') setLocalCode(code);
    });
  }, []);

  const extensions = useMemo(() => [
    javascript(),
    autocompletion({ override: [strudelCompletions] }),
  ], []);

  const handleChange = (value: string) => {
    setLocalCode(value);
    useStore.getState().setActiveCode(value);
    eventBus.emit('code:changed', { code: value, origin: 'user_edit' });
    syncController.notify('user_edit', value);
  };

  return (
    <div className={styles.wrapper}>
      <CodeMirror
        value={localCode}
        theme={oneDark}
        extensions={extensions}
        onChange={handleChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          autocompletion: false,
        }}
        placeholder='s("bd sd [hh hh] cp")'
        className={styles.editor}
      />
    </div>
  );
}
