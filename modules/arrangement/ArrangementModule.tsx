import type { PanelProps } from '@layout/registry/PanelRegistry';
import { useEffect, useState } from 'react';
import type { Hap } from '@core/types/hap';
//import { derive, mutate } from './arrangement';
import styles from './ArrangementModule.module.css';

export function ArrangementModule({ api }: PanelProps) {
  const [haps, setHaps] = useState<Hap[]>([]);

  // Receive haps on each evaluation.
  useEffect(() => api.subscribeToHaps(setHaps), [api]);

  const view = derive(api.getCode(), haps);

  const handleAction = () => {
    api.modifyCode((current) => mutate(current /*, action */));
  };

  return (
    <div className={styles.root}>
      <button type="button" onClick={handleAction}>Arrangement</button>
      <pre>{JSON.stringify(view, null, 2)}</pre>
    </div>
  );
}
