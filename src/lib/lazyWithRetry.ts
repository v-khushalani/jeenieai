import React from 'react';

type ModuleWithDefault<T extends React.ComponentType<any>> = {
  default: T;
};

type Importer<T extends React.ComponentType<any>> = () => Promise<ModuleWithDefault<T>>;

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed|ChunkLoadError/i;

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: Importer<T>,
  retryScope = 'global',
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const retryKey = `lazy-retry:${retryScope}`;
    const hasRetried = typeof window !== 'undefined' && sessionStorage.getItem(retryKey) === 'true';

    try {
      const module = await importer();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(retryKey);
      }
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isChunkLoadError = CHUNK_ERROR_PATTERN.test(message);

      if (isChunkLoadError && !hasRetried && typeof window !== 'undefined') {
        sessionStorage.setItem(retryKey, 'true');
        window.location.reload();
        return new Promise<ModuleWithDefault<T>>(() => {
          // Keep Suspense pending while reload is in progress.
        });
      }

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(retryKey);
      }
      throw error;
    }
  });
}
