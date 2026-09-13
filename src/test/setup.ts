import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia — ThemeProvider (src/design/ThemeProvider.tsx)
// reads it on every render, so anything that mounts AppShell needs this even
// when the test itself has nothing to do with theming. Guarded by `window`
// existing since this setup file also runs for convex/'s edge-runtime tests,
// which have no window at all.
// jsdom's built-in localStorage throws ("getItem is not a function") without
// a `--localstorage-file` flag Vitest doesn't pass — a plain in-memory
// polyfill is all ThemeProvider (src/design/ThemeProvider.tsx) actually
// needs from it in a test.
if (typeof window !== "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
