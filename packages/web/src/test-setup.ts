import '@testing-library/jest-dom';

// jsdom does not implement the Clipboard API. Provide a no-op stub so
// components that call navigator.clipboard.writeText don't throw.
// Individual tests override this with vi.fn() via the test's beforeEach.
Object.defineProperty(global.navigator, 'clipboard', {
  value: { writeText: () => Promise.resolve() },
  writable: true,
  configurable: true,
});
