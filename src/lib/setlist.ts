// Extracted from EventManageDetail.tsx's reorder buttons (see #34) — the
// array-swap logic was a closure over component state with nothing to test
// it through except a browser. Returns the same array reference when the
// move is out of bounds, not a copy, so a caller can skip a re-render.
export function moveSetlistItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const swapWith = index + direction;
  if (swapWith < 0 || swapWith >= items.length) return items;
  const next = [...items];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}
