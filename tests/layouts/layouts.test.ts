/**
 * Tests for the reduced set of default layouts (`layouts/*.json`, bundled at
 * build time via `import.meta.glob('/layouts/*.json', ...)` in
 * `src/layout/loaders/layout-loader.ts`), plus their `userdata/layouts/*.json`
 * mirror (seeded copy used by the Electron desktop build — see
 * `loadUserLayouts()` in the same file).
 *
 * These are plain fs/JSON checks (no `import.meta.glob`, no Vite, no React):
 * the goal is to catch config drift (duplicate ids, orphaned files, a
 * `panelId` referencing a module that isn't registered in `App.tsx`, a tree
 * that doesn't respect the `LayoutNode` union from `src/core/types/layout.ts`)
 * without needing a browser or DOM.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { LayoutDefinition, LayoutNode } from '@core/types/layout';

const LAYOUTS_DIR = path.resolve(__dirname, '..', '..', 'layouts');
const USERDATA_LAYOUTS_DIR = path.resolve(__dirname, '..', '..', 'userdata', 'layouts');

// The only panel ids actually registered by `src/ui/App.tsx` (built-in module
// `index.ts` imports). Keep in sync manually — there is no runtime registry
// available outside a React/DOM environment to derive this from.
const REGISTERED_PANEL_IDS = new Set([
  'transport',
  'editor',
  'session',
  'drum-grid',
  'piano-roll',
  'mixer',
  'effects',
  'arrangement',
]);

function readJsonFiles(dir: string): { file: string; content: unknown }[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({
      file,
      content: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')),
    }));
}

/** Recursively validates a value against the `LayoutNode` union. Returns a
 *  list of human-readable problems (empty = valid). */
function validateLayoutNode(node: unknown, at = 'tree'): string[] {
  if (typeof node !== 'object' || node === null) {
    return [`${at}: expected an object, got ${JSON.stringify(node)}`];
  }
  const n = node as Record<string, unknown>;

  if (n.type === 'panel') {
    if (typeof n.panelId !== 'string' || n.panelId.trim() === '') {
      return [`${at}: panel node has an empty/non-string panelId`];
    }
    return [];
  }

  if (n.type === 'split') {
    const problems: string[] = [];
    if (n.axis !== 'x' && n.axis !== 'y') {
      problems.push(`${at}: split node has invalid axis ${JSON.stringify(n.axis)}`);
    }
    if (typeof n.ratio !== 'number' || Number.isNaN(n.ratio)) {
      problems.push(`${at}: split node has non-numeric ratio ${JSON.stringify(n.ratio)}`);
    }
    if (!Array.isArray(n.children) || n.children.length !== 2) {
      problems.push(`${at}: split node must have exactly 2 children`);
      return problems;
    }
    problems.push(...validateLayoutNode(n.children[0], `${at}.children[0]`));
    problems.push(...validateLayoutNode(n.children[1], `${at}.children[1]`));
    return problems;
  }

  return [`${at}: unknown node type ${JSON.stringify(n.type)}`];
}

/** Collects every `panelId` referenced by leaf nodes in the tree. */
function collectPanelIds(node: LayoutNode, out: string[] = []): string[] {
  if (node.type === 'panel') {
    out.push(node.panelId);
  } else {
    collectPanelIds(node.children[0], out);
    collectPanelIds(node.children[1], out);
  }
  return out;
}

describe('layouts/*.json — default layout set', () => {
  const files = readJsonFiles(LAYOUTS_DIR);

  it('contains exactly the 3 expected layout files', () => {
    expect(files.map((f) => f.file).sort()).toEqual([
      'arranger.json',
      'live-session.json',
      'minimal.json',
    ]);
  });

  it('is all valid JSON parsing to a LayoutDefinition-shaped object', () => {
    for (const { file, content } of files) {
      expect(content, file).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        tree: expect.any(Object),
      });
    }
  });

  it('has a unique id per file', () => {
    const ids = files.map((f) => (f.content as LayoutDefinition).id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['arranger', 'live-session', 'minimal']);
  });

  it('every tree respects the LayoutNode union recursively', () => {
    for (const { file, content } of files) {
      const problems = validateLayoutNode((content as LayoutDefinition).tree);
      expect(problems, `${file}: ${problems.join('; ')}`).toEqual([]);
    }
  });

  it('every leaf panelId is a non-empty string', () => {
    for (const { file, content } of files) {
      const ids = collectPanelIds((content as LayoutDefinition).tree);
      expect(ids.length, file).toBeGreaterThan(0);
      for (const id of ids) {
        expect(typeof id, `${file}: ${JSON.stringify(id)}`).toBe('string');
        expect(id.trim().length, `${file}: empty panelId`).toBeGreaterThan(0);
      }
    }
  });

  it('every leaf panelId references a panel actually registered in App.tsx', () => {
    for (const { file, content } of files) {
      const ids = collectPanelIds((content as LayoutDefinition).tree);
      for (const id of ids) {
        expect(REGISTERED_PANEL_IDS.has(id), `${file}: unregistered panelId "${id}"`).toBe(true);
      }
    }
  });

  it('every layout includes a "transport" panel (transport bar requirement)', () => {
    for (const { file, content } of files) {
      const ids = collectPanelIds((content as LayoutDefinition).tree);
      expect(ids, file).toContain('transport');
    }
  });
});

describe('userdata/layouts/*.json — desktop seed mirrors core layouts', () => {
  it('exists and contains a readable directory', () => {
    expect(fs.existsSync(USERDATA_LAYOUTS_DIR)).toBe(true);
  });

  it('has exactly the same set of ids as layouts/, no more, no less', () => {
    const coreIds = readJsonFiles(LAYOUTS_DIR)
      .map((f) => (f.content as LayoutDefinition).id)
      .sort();
    const userdataIds = readJsonFiles(USERDATA_LAYOUTS_DIR)
      .map((f) => (f.content as LayoutDefinition).id)
      .sort();

    expect(userdataIds).toEqual(coreIds);
  });

  it('has no orphaned file from a previously removed layout (production, two-columns, mixing, live-coding, arranging, test-layout)', () => {
    const removedIds = ['production', 'two-columns', 'mixing', 'live-coding', 'arranging', 'test-layout'];
    const allIds = [
      ...readJsonFiles(LAYOUTS_DIR).map((f) => (f.content as LayoutDefinition).id),
      ...readJsonFiles(USERDATA_LAYOUTS_DIR).map((f) => (f.content as LayoutDefinition).id),
    ];
    for (const removed of removedIds) {
      expect(allIds, `stale id "${removed}" still present`).not.toContain(removed);
    }
  });
});
