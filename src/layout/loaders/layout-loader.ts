import { layoutRegistry } from '@layout/registry/LayoutRegistryImpl';
import type { LayoutDefinition } from '@core/types/layout';
import type {} from '@core/types/desktop';

// Core layouts are bundled at build time.
const modules = import.meta.glob<LayoutDefinition>('/layouts/*.json', {
  eager: true,
  import: 'default',
});

Object.values(modules).forEach((layout) => layoutRegistry.register(layout));

// Under Electron, merge user layouts (userdata/layouts) on top — same id overrides core.
void loadUserLayouts();

async function loadUserLayouts(): Promise<void> {
  const desktop = window.dualDesktop;
  if (!desktop) return;

  try {
    const files = (await desktop.listUserDir('layouts')).filter((f) => f.endsWith('.json'));
    await Promise.all(
      files.map(async (file) => {
        const response = await fetch(`dual://user/layouts/${file}`);
        if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
        layoutRegistry.register((await response.json()) as LayoutDefinition);
      }),
    );
  } catch (error) {
    console.error('Failed to load user layouts:', error);
  }
}
