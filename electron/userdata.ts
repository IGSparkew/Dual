import fs from 'node:fs';
import path from 'node:path';
import { getCoreLayoutsDir, getUserDataRoot } from './paths';

export const USER_DIRS = ['layouts', 'samples', 'modules', 'projects', 'themes', 'presets'] as const;
export type UserDir = (typeof USER_DIRS)[number];

export function ensureUserDirs(): void {
  for (const dir of USER_DIRS) {
    fs.mkdirSync(path.join(getUserDataRoot(), dir), { recursive: true });
  }
}

/** First run only (empty userdata/layouts): copy core layouts as editable user copies. */
export function seedUserDirs(): void {
  const target = path.join(getUserDataRoot(), 'layouts');
  if (fs.readdirSync(target).length > 0) return;

  const source = getCoreLayoutsDir();
  if (!fs.existsSync(source)) return;

  for (const file of fs.readdirSync(source).filter((f) => f.endsWith('.json'))) {
    fs.copyFileSync(path.join(source, file), path.join(target, file));
  }
}
