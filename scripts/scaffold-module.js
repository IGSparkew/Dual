// scripts/scaffold-module.js
//
// Scaffolds a new graphical module under modules/<id>/, matching the
// structure and registration contract of the built-in modules (session,
// editor, …). Run via:
//
//   npm run make:module -- <module-id> [--slot <slot>] [--capabilities <a,b,c>] [--icon <LucideName>] [--no-app-import]
//
// Example:
//   npm run make:module -- piano-roll --slot center-top --capabilities haps:read,code:write
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

const SLOTS = ['center-top', 'center-bottom', 'left', 'right', 'bottom'];
const CAPS = ['haps:read', 'code:write', 'code:read', 'state:read', 'state:write'];

// Reads a flag value: --slot foo  or  --slot=foo
function readFlag(name) {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return undefined;
  const a = args[i];
  if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
  return args[i + 1]; // value in the following argument
}

const noAppImport = args.includes('--no-app-import');
const slot = readFlag('slot') ?? 'center-top';
const icon = readFlag('icon') ?? 'Puzzle';
const caps = (readFlag('capabilities') ?? 'haps:read,state:read')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean);

// id = first positional argument (not a flag, not a flag value)
const flagValues = new Set();
for (const name of ['slot', 'capabilities', 'icon']) {
  const i = args.findIndex((a) => a === `--${name}`);
  if (i !== -1) flagValues.add(args[i + 1]);
}
const id = args.find((a) => !a.startsWith('--') && !flagValues.has(a));

if (!id) {
  console.error(
    'Usage: npm run make:module -- <module-id> [--slot <slot>] [--capabilities <a,b,c>] [--icon <LucideName>] [--no-app-import]',
  );
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error(`✗ Module id "${id}" invalide. Utilise du kebab-case (ex: piano-roll).`);
  process.exit(1);
}

if (!SLOTS.includes(slot)) {
  console.error(`✗ Slot "${slot}" inconnu. Valeurs possibles : ${SLOTS.join(', ')}`);
  process.exit(1);
}

const unknownCaps = caps.filter((c) => !CAPS.includes(c));
if (unknownCaps.length) {
  console.error(`✗ Capabilities inconnues : ${unknownCaps.join(', ')}. Valeurs possibles : ${CAPS.join(', ')}`);
  process.exit(1);
}

// piano-roll -> PianoRoll
const Pascal = id
  .split(/[-_]/)
  .map((s) => s[0].toUpperCase() + s.slice(1))
  .join('');
const Panel = `${Pascal}Panel`; // component + file base, e.g. PianoRollPanel
const model = `${id}-model`; // pure logic module, e.g. piano-roll-model

const dir = path.resolve('modules', id);
if (existsSync(dir)) {
  console.error(`✗ Le module "${id}" existe déjà à ${dir}`);
  process.exit(1);
}

const manifest = {
  id,
  name: Pascal,
  version: '1.0.0',
  icon,
  description: `${Pascal} module`,
  defaultSlot: slot,
  minSize: { width: 300, height: 200 },
  capabilities: caps,
};

const indexTs = `import { panelRegistry } from '@layout/registry/PanelRegistryImpl';
import type { SlotId, PanelCapability } from '@core/types/panel';
import manifest from './manifest.json';
import { ${Panel} } from './${Panel}';

panelRegistry.register({
  ...manifest,
  defaultSlot: manifest.defaultSlot as SlotId,
  capabilities: manifest.capabilities as PanelCapability[],
  component: ${Panel},
});
`;

const modelTs = `import type { Hap } from '@core/types/hap';

/** Derived view — colocated with the function that produces it. */
export interface ${Pascal}View {
  // … fields projected from the code / haps
}

/** Read: code → model. Pure, stateless. */
export function derive(_code: string, _haps: Hap[] = []): ${Pascal}View {
  return {};
}

/** Write: action → new code. Pure, stateless. */
export function mutate(code: string /*, action */): string {
  return code;
}
`;

const panelTsx = `import type { PanelProps } from '@layout/registry/PanelRegistry';
import { useEffect, useState } from 'react';
import type { Hap } from '@core/types/hap';
import { derive, mutate } from './${model}';
import styles from './${Panel}.module.css';

export function ${Panel}({ api }: PanelProps) {
  const [haps, setHaps] = useState<Hap[]>([]);

  // Receive haps on each evaluation.
  useEffect(() => api.subscribeToHaps(setHaps), [api]);

  const view = derive(api.getCode(), haps);

  const handleAction = () => {
    api.modifyCode((current) => mutate(current /*, action */));
  };

  return (
    <div className={styles.root}>
      <button type="button" onClick={handleAction}>${Pascal}</button>
      <pre>{JSON.stringify(view, null, 2)}</pre>
    </div>
  );
}
`;

const panelCss = `.root {
  width: 100%;
  height: 100%;
}
`;

await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(dir, 'index.ts'), indexTs);
await writeFile(path.join(dir, `${model}.ts`), modelTs);
await writeFile(path.join(dir, `${Panel}.tsx`), panelTsx);
await writeFile(path.join(dir, `${Panel}.module.css`), panelCss);

// Auto-register the module by inserting its import into the App shell.
const importLine = `import '@modules/${id}/index';`;
let appNotice = `  Ajoute  ${importLine}  dans src/ui/App.tsx`;

if (!noAppImport) {
  const appPath = path.resolve('src/ui/App.tsx');
  try {
    const app = await readFile(appPath, 'utf8');
    if (app.includes(importLine)) {
      appNotice = `  Import déjà présent dans src/ui/App.tsx`;
    } else {
      // Insert right after the last existing built-in module import.
      const moduleImportRe = /import '@modules\/[^']+\/index';/g;
      const matches = [...app.matchAll(moduleImportRe)];
      if (matches.length) {
        const last = matches[matches.length - 1];
        const at = last.index + last[0].length;
        const next = app.slice(0, at) + `\n${importLine}` + app.slice(at);
        await writeFile(appPath, next);
        appNotice = `  Import ajouté dans src/ui/App.tsx`;
      }
    }
  } catch {
    // App.tsx unreadable — fall back to the manual instruction.
  }
}

console.log(`✓ Module "${id}" créé dans modules/${id}/`);
console.log(`  Slot : ${slot} — Capabilities : ${caps.join(', ')} — Icon : ${icon}`);
console.log(appNotice);
