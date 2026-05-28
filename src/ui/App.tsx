import styles from './App.module.css';

export function App() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.logo}>Struddle DAW</span>
      </header>
      <main className={styles.workspace}>
        <p className={styles.placeholder}>Phase 1 — en cours d&apos;initialisation</p>
      </main>
    </div>
  );
}
