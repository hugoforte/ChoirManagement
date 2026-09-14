---
status: accepted
---

# Token Share Links grant unauthenticated read of Member-only Bulletins

Every piece of Member-only content in this app has so far been reachable only by a signed-in Member, with the one exception — public Events — modelled as an explicit `visibility` field and served by functions that live in `convex/public.ts` and query nothing sensitive. Bulletins break that pattern deliberately: a Bulletin is Members-only content, but its Share Link may be issued in **token mode**, which lets anyone holding the URL read that one Bulletin without an account.

We chose this over extending Event-style `Public`/`Private` Visibility to Bulletins, because the need is not "publish to the website" but "forward this week's notes to a guest conductor, a parent, or a member who hasn't finished signing up" — a per-recipient act, not a publication. A second public content surface would also have to be kept out of search engines and out of the public Events listing, which is more machinery than a token.

Consequences worth stating plainly. The token is a bearer credential: anyone it is forwarded to has the same access, and the app cannot tell them apart. Revocation exists, but only at the granularity of the whole link — regenerating a Bulletin's Share Link invalidates the old URL for everyone. Token mode grants **read only**; it never permits writes. Polls are deliberately excluded from token mode entirely (see ADR-0005's sibling reasoning): a Poll's grid is named personal data about identifiable Members, and no use case justified exposing it to URL holders.
