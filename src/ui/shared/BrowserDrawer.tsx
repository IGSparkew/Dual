import { useMemo, useState } from 'react';
import { FileAudio, X } from 'lucide-react';
import { panelRegistry } from '@layout/registry/PanelRegistryImpl';
import { createPanelApi } from '@layout/api/PanelApiImpl';
import styles from './BrowserDrawer.module.css';

const BROWSER_PANEL_ID = 'browser';

/**
 * The sample browser is reachable from anywhere rather than owned by a layout
 * slot: it is a tool you open, take a sound from and close again, in whatever
 * layout you happen to be working in. So the shell hosts it as a side drawer
 * behind a header button, and no layout has to reserve room for it.
 *
 * It is still an ordinary registered module (same manifest, same PanelApi) —
 * only its host differs. It stays mounted once opened so a filter, the
 * expanded banks and a pending import survive closing the drawer.
 */
export function BrowserDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const panel = panelRegistry.get(BROWSER_PANEL_ID);
  const api = useMemo(() => createPanelApi(BROWSER_PANEL_ID), []);
  const Panel = panel?.component;

  const toggle = () => {
    setOpen((wasOpen) => !wasOpen);
    setMounted(true);
  };

  return (
    <>
      <button
        className={`${styles.trigger} ${open ? styles.triggerActive : ''}`}
        onClick={toggle}
        title="Sample Browser"
        aria-label="Sample Browser"
        aria-pressed={open}
      >
        <FileAudio size={14} />
      </button>

      {/* Kept mounted but hidden when closed — remounting would drop the
          panel's local state (filter, open banks) on every visit. */}
      {mounted && Panel && (
        <aside className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-hidden={!open}>
          <div className={styles.drawerHeader}>
            <FileAudio size={12} />
            <span className={styles.drawerTitle}>{panel?.name ?? 'Sample Browser'}</span>
            <button className={styles.close} onClick={() => setOpen(false)} aria-label="Fermer">
              <X size={13} />
            </button>
          </div>
          <div className={styles.drawerBody}>
            <Panel api={api} />
          </div>
        </aside>
      )}
    </>
  );
}
