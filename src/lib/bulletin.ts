// A Bulletin stores one `updatedAt` that doubles as the "edited" timestamp
// #49 asks for, rather than a second field saying the same thing. Publishing
// sets updatedAt and publishedAt to the same instant, so "has been edited"
// means strictly later — not merely different. Both the manage list and the
// editor show that badge, so the rule is named once here instead of being
// re-derived as a `>` comparison at each site.
type BulletinTimestamps = { publishedAt?: number; updatedAt: number };

export function editedAt(bulletin: BulletinTimestamps): number | null {
  if (bulletin.publishedAt === undefined) return null;
  return bulletin.updatedAt > bulletin.publishedAt ? bulletin.updatedAt : null;
}
