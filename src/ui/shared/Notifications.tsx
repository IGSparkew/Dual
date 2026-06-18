import { useEffect } from 'react';
import { useStore } from '@core/state/store';
import styles from './Notifications.module.css';

export function Notifications() {
  const notifications = useStore((s) => s.notifications);
  const remove = useStore((s) => s.removeNotification);

  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[notifications.length - 1];
    const t = setTimeout(() => remove(latest.id), 3500);
    return () => clearTimeout(t);
  }, [notifications, remove]);

  if (notifications.length === 0) return null;

  return (
    <div className={styles.stack}>
      {notifications.map((n) => (
        <div
          key={n.id}
          className={styles.toast}
          data-type={n.type}
          onClick={() => remove(n.id)}
        >
          {n.message}
        </div>
      ))}
    </div>
  );
}
