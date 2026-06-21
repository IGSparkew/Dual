import { useEffect, useState } from 'react';
import { useStore } from '@core/state/store';
import { eventBus } from '@core/events/EventBusImpl';
import type { PanelProps } from '@layout/PanelRegistry';
import styles from './EditorPanel.module.css';

export function EditorPanel(_: PanelProps) {
  const storeCode = useStore((s) => s.activeCode);
  const [localCode, setLocalCode] = useState(storeCode);

  // Sync incoming ui_action changes (e.g. sample loader replacing code)
  useEffect(() => {
    return eventBus.on('code:changed', ({ code, origin }) => {
      if (origin === 'ui_action') setLocalCode(code);
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const code = e.target.value;
    setLocalCode(code);
    useStore.getState().setActiveCode(code);
    eventBus.emit('code:changed', { code, origin: 'user_edit' });
  };

  return (
    <textarea
      className={styles.editor}
      value={localCode}
      onChange={handleChange}
      spellCheck={false}
      placeholder='s("bd sd [hh hh] cp")'
    />
  );
}
