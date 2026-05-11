import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

function clearStorage(storage: Storage | undefined) {
  if (!storage) return;
  if (typeof storage.clear === 'function') {
    storage.clear();
    return;
  }
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key) storage.removeItem(key);
  }
}

afterEach(() => {
  cleanup();
  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);
});
