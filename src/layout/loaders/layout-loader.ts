import { layoutRegistry } from '@layout/registry/LayoutRegistryImpl';
import type { LayoutDefinition } from '@core/types/layout';

const modules = import.meta.glob<LayoutDefinition>('/layouts/*.json', {
  eager: true,
  import: 'default',
});

Object.values(modules).forEach((layout) => layoutRegistry.register(layout));
