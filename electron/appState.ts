import fs from 'node:fs';
import path from 'node:path';
import { getUserDataRoot } from './paths';

interface AppStateFile {
  lastProjectPath: string | null;
}

function getAppStatePath(): string {
  return path.join(getUserDataRoot(), 'app-state.json');
}

export function getLastProjectPath(): string | null {
  const file = getAppStatePath();
  if (!fs.existsSync(file)) return null;

  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf-8')) as AppStateFile;
    return state.lastProjectPath ?? null;
  } catch {
    return null;
  }
}

export function setLastProjectPath(lastProjectPath: string | null): void {
  const state: AppStateFile = { lastProjectPath };
  fs.writeFileSync(getAppStatePath(), JSON.stringify(state, null, 2), 'utf-8');
}
