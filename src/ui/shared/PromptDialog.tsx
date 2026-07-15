import { useEffect, useRef, useState } from 'react';
import { subscribePromptRequests, type PromptRequest } from './prompt-dialog';
import styles from './PromptDialog.module.css';

export function PromptDialog() {
  const [request, setRequest] = useState<PromptRequest | null>(null);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribePromptRequests(setRequest), []);

  useEffect(() => {
    if (request) {
      setValue(request.defaultValue);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [request]);

  if (!request) return null;

  const submit = () => request.resolve(value);
  const cancel = () => request.resolve(null);

  return (
    <div className={styles.overlay} onMouseDown={cancel}>
      <form
        className={styles.dialog}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className={styles.title}>{request.title}</label>
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && cancel()}
        />
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={cancel}>
            Cancel
          </button>
          <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
