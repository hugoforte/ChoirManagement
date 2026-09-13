// Optional string fields normalize "" to undefined here, not in whatever form
// handler that used to repeat `field || undefined` before calling into a
// mutation. Doing it on the server (not the client) is what actually makes
// clearing a field work: an explicit `undefined` sent from the client is
// dropped before it reaches the handler — indistinguishable from the key
// being omitted — but "" survives the wire fine, so the empty-string
// convention has to be resolved after arguments arrive, not before they're
// sent. Shared by events.ts, pieces.ts, and choirSettings.ts.
export function normalizeOptionalText(value: string | undefined): string | undefined {
  return value || undefined;
}
