import { lazy, type ComponentType } from 'react';

/** Lazy-load a named export from a dynamic import (pages use named exports). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed(importer: () => Promise<Record<string, ComponentType<any>>>, exportName: string) {
  return lazy(() => importer().then((mod) => ({ default: mod[exportName] })));
}
