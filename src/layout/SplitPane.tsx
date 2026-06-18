import { useState, useRef, useCallback } from 'react';
import styles from './SplitPane.module.css';

interface SplitPaneProps {
  axis?: 'x' | 'y';
  defaultRatio?: number;
  children: [React.ReactNode, React.ReactNode];
}

export function SplitPane({ axis = 'x', defaultRatio = 0.5, children }: SplitPaneProps) {
  const [ratio, setRatio] = useState(defaultRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const onMove = (ev: MouseEvent) => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const raw =
          axis === 'x'
            ? (ev.clientX - rect.left) / rect.width
            : (ev.clientY - rect.top) / rect.height;
        setRatio(Math.max(0.1, Math.min(0.9, raw)));
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [axis],
  );

  const isH = axis === 'x';
  const [first, second] = children;

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isH ? styles.horizontal : styles.vertical}`}
    >
      <div
        className={styles.pane}
        style={{ [isH ? 'width' : 'height']: `${ratio * 100}%` }}
      >
        {first}
      </div>
      <div
        className={`${styles.handle} ${isH ? styles.handleH : styles.handleV}`}
        onMouseDown={handleMouseDown}
      />
      <div className={`${styles.pane} ${styles.paneFlex}`}>{second}</div>
    </div>
  );
}
