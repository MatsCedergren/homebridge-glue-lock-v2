import { beforeEach, vi } from 'vitest';

// Tests must never call the real Glue API. A test that needs HTTP stubs fetch itself.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
    throw new Error(`Real network access is blocked in tests: ${String(url)}`);
  }));
});
