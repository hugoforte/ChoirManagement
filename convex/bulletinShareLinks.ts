// Share Link management for a Bulletin (#83, ADR-0004). Every function here
// requires `manageBulletins`; the unauthenticated read the token buys lives
// in convex/public.ts and nowhere else.
//
// A Bulletin carries at most one Share Link, so there is no create/delete of
// rows here — only the one optional `shareLink` object on the Bulletin being
// set, re-tokened, or cleared. Regenerating is the whole revocation story:
// the token is a bearer credential and the app cannot tell two holders of
// the same URL apart (ADR-0004).
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireCan, requireMember } from "./lib/auth";

const shareLinkMode = v.union(v.literal("sign_in_required"), v.literal("token"));
const shareLink = v.object({ token: v.string(), mode: shareLinkMode });

// 32 bytes — a bearer credential that has to survive being forwarded around
// in plain text, with no expiry and no per-recipient narrowing to fall back
// on (ADR-0004), so it is sized to be unguessable rather than short.
const TOKEN_BYTES = 32;

// base64url, unpadded: the token goes straight into a `/s/:token` path
// segment, so "+", "/" and "=" would all need escaping.
//
// crypto.getRandomValues, never Math.random — Math.random is seeded from a
// predictable source and would make every issued link guessable from one
// observed token.
function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The manage panel's read. Null covers both "no such Bulletin" and "no Share
// Link yet" because the panel renders the same empty state for each, and its
// sibling `bulletins.get` subscription is what decides a deleted Bulletin is
// a 404 — a throw here would race that and surface as an error boundary
// instead.
export const get = query({
  args: { bulletinId: v.id("bulletins") },
  returns: v.union(v.null(), shareLink),
  handler: async (ctx, { bulletinId }) => {
    await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    return bulletin?.shareLink ?? null;
  },
});

// Issuing twice is an error rather than a silent no-op or a silent re-issue:
// one would leave the caller believing they had a fresh URL when they had the
// old one, the other would revoke a URL already in circulation without the
// confirmation `regenerate` makes the caller pass through.
//
// Deliberately no "must be published" check. A draft's token resolves to
// nothing through the public query, which is where that rule is enforced and
// tested; the manage panel additionally hides the control until the Bulletin
// is published, so drafting a link ahead of publishing stays harmless.
export const issue = mutation({
  args: { bulletinId: v.id("bulletins"), mode: shareLinkMode },
  returns: v.string(),
  handler: async (ctx, { bulletinId, mode }) => {
    await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) throw new Error("Bulletin not found");
    if (bulletin.shareLink) throw new Error("Bulletin already has a Share Link");

    const token = generateToken();
    // No updatedAt bump here or in any mutation below: updatedAt doubles as
    // the Bulletin's "edited" timestamp (see schema.ts), and issuing a link
    // changes nothing a reader would recognise as an edit.
    await ctx.db.patch("bulletins", bulletinId, { shareLink: { token, mode } });
    return token;
  },
});

// Switching between modes keeps the same URL — the two modes differ in who
// may open the link, not in which link it is.
export const setMode = mutation({
  args: { bulletinId: v.id("bulletins"), mode: shareLinkMode },
  returns: v.null(),
  handler: async (ctx, { bulletinId, mode }) => {
    await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) throw new Error("Bulletin not found");
    if (!bulletin.shareLink) throw new Error("Bulletin has no Share Link");

    await ctx.db.patch("bulletins", bulletinId, {
      shareLink: { token: bulletin.shareLink.token, mode },
    });
    return null;
  },
});

// The only revocation the model offers short of removing the link entirely:
// it invalidates the old URL for everyone holding it, which is the whole
// point and why the caller confirms first.
export const regenerate = mutation({
  args: { bulletinId: v.id("bulletins") },
  returns: v.string(),
  handler: async (ctx, { bulletinId }) => {
    await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) throw new Error("Bulletin not found");
    if (!bulletin.shareLink) throw new Error("Bulletin has no Share Link");

    const token = generateToken();
    await ctx.db.patch("bulletins", bulletinId, {
      shareLink: { token, mode: bulletin.shareLink.mode },
    });
    return token;
  },
});

export const revoke = mutation({
  args: { bulletinId: v.id("bulletins") },
  returns: v.null(),
  handler: async (ctx, { bulletinId }) => {
    await requireCan(ctx, "manageBulletins");
    const bulletin = await ctx.db.get("bulletins", bulletinId);
    if (!bulletin) throw new Error("Bulletin not found");

    // Clearing the field rather than storing a tombstone: an absent
    // shareLink is exactly "no Share Link", and the by_share_link_token
    // index then holds nothing that could resolve.
    await ctx.db.patch("bulletins", bulletinId, { shareLink: undefined });
    return null;
  },
});

// The signed-in half of the Share Link route. A Member who opens either mode
// of link should land on the real reading view rather than the guest
// rendering, so /s/:token trades the token for an id and redirects.
//
// requireMember, not requireCan: any Member may read any published Bulletin.
// Lives here rather than in public.ts because it is authenticated — public.ts
// stays anonymous-only by construction.
export const resolveForMember = query({
  args: { token: v.string() },
  returns: v.union(v.null(), v.id("bulletins")),
  handler: async (ctx, { token }) => {
    await requireMember(ctx);
    const bulletin = await ctx.db
      .query("bulletins")
      .withIndex("by_share_link_token", (q) => q.eq("shareLink.token", token))
      .unique();
    if (!bulletin || bulletin.status !== "published") return null;
    return bulletin._id;
  },
});
