/// <reference types="vite/client" />
// Share Link management (#83, ADR-0004). The unauthenticated read a token
// buys is pinned separately in public.test.ts — this file covers the
// authenticated half: who may issue a link, and what regenerating actually
// changes.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://example.clerk.accounts.dev";
const directorIdentity = { subject: "director_1", issuer: ISSUER };
const choristerIdentity = { subject: "chorister_1", issuer: ISSUER };

async function seedMembers(t: ReturnType<typeof convexTest>) {
  const directorId = await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${ISSUER}|director_1`,
      name: "Dana Director",
      email: "dana@example.com",
      role: "director",
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("members", {
      clerkUserId: `${ISSUER}|chorister_1`,
      name: "Chris Chorister",
      email: "chris@example.com",
      role: "chorister",
    }),
  );
  return { directorId };
}

const PUBLISHED_AT = 1_000;

async function insertBulletin(
  t: ReturnType<typeof convexTest>,
  createdByMemberId: Id<"members">,
  status: "draft" | "published" = "published",
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("bulletins", {
      title: "This week",
      body: "Warm-ups at 6:45.",
      eventId: undefined,
      status,
      publishedAt: status === "published" ? PUBLISHED_AT : undefined,
      updatedAt: PUBLISHED_AT,
      createdByMemberId,
      updatedByMemberId: undefined,
      shareLink: undefined,
    }),
  );
}

test("issue refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

test("regenerate refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  await t.withIdentity(directorIdentity).mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.bulletinShareLinks.regenerate, { bulletinId }),
  ).rejects.toThrow(/Requires capability: manageBulletins/);
});

test("issue stores a Share Link in the requested mode", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);

  const token = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "sign_in_required" });

  const stored = await t.withIdentity(directorIdentity).query(api.bulletinShareLinks.get, { bulletinId });
  expect(stored).toEqual({ token, mode: "sign_in_required" });
});

test("issuing twice throws rather than silently replacing the first link", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  const director = t.withIdentity(directorIdentity);
  await director.mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" });

  await expect(
    director.mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" }),
  ).rejects.toThrow(/already has a Share Link/);
});

test("tokens are distinct across Bulletins", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const director = t.withIdentity(directorIdentity);
  const [first, second] = await Promise.all([
    insertBulletin(t, directorId),
    insertBulletin(t, directorId),
  ]);

  const tokens = await Promise.all([
    director.mutation(api.bulletinShareLinks.issue, { bulletinId: first, mode: "token" }),
    director.mutation(api.bulletinShareLinks.issue, { bulletinId: second, mode: "token" }),
  ]);

  expect(tokens[0]).not.toBe(tokens[1]);
});

test("an issued token is URL-safe and long enough to be unguessable", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);

  const token = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" });

  // base64url of 32 bytes, unpadded: 43 characters drawn from an alphabet
  // that needs no escaping inside a path segment.
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
});

test("regenerate replaces the token and keeps the mode", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  const director = t.withIdentity(directorIdentity);
  const original = await director.mutation(api.bulletinShareLinks.issue, {
    bulletinId,
    mode: "sign_in_required",
  });

  const regenerated = await director.mutation(api.bulletinShareLinks.regenerate, { bulletinId });

  expect(regenerated).not.toBe(original);
  expect(await director.query(api.bulletinShareLinks.get, { bulletinId })).toEqual({
    token: regenerated,
    mode: "sign_in_required",
  });
});

// updatedAt doubles as the Bulletin's "edited" timestamp, so a Share Link
// change must not touch it — otherwise every reader would see a Bulletin
// marked as edited because a link was handed out.
test("issuing and regenerating leave updatedAt untouched", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  const director = t.withIdentity(directorIdentity);

  await director.mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" });
  await director.mutation(api.bulletinShareLinks.setMode, { bulletinId, mode: "sign_in_required" });
  await director.mutation(api.bulletinShareLinks.regenerate, { bulletinId });
  await director.mutation(api.bulletinShareLinks.revoke, { bulletinId });

  const bulletin = await t.run(async (ctx) => ctx.db.get(bulletinId));
  expect(bulletin?.updatedAt).toBe(PUBLISHED_AT);
});

test("setMode keeps the same token", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  const director = t.withIdentity(directorIdentity);
  const token = await director.mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" });

  await director.mutation(api.bulletinShareLinks.setMode, { bulletinId, mode: "sign_in_required" });

  expect(await director.query(api.bulletinShareLinks.get, { bulletinId })).toEqual({
    token,
    mode: "sign_in_required",
  });
});

test("setMode on a Bulletin with no Share Link throws", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);

  await expect(
    t.withIdentity(directorIdentity).mutation(api.bulletinShareLinks.setMode, { bulletinId, mode: "token" }),
  ).rejects.toThrow(/no Share Link/);
});

test("revoke clears the Share Link", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  const director = t.withIdentity(directorIdentity);
  await director.mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "token" });

  await director.mutation(api.bulletinShareLinks.revoke, { bulletinId });

  expect(await director.query(api.bulletinShareLinks.get, { bulletinId })).toBeNull();
});

test("resolveForMember trades a token for its published Bulletin's id", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  const token = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "sign_in_required" });

  const resolved = await t.withIdentity(choristerIdentity).query(api.bulletinShareLinks.resolveForMember, {
    token,
  });

  expect(resolved).toBe(bulletinId);
});

test("resolveForMember returns null for a draft's token", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId, "draft");
  const token = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "sign_in_required" });

  const resolved = await t.withIdentity(choristerIdentity).query(api.bulletinShareLinks.resolveForMember, {
    token,
  });

  expect(resolved).toBeNull();
});

test("resolveForMember refuses an anonymous caller", async () => {
  const t = convexTest(schema, modules);
  const { directorId } = await seedMembers(t);
  const bulletinId = await insertBulletin(t, directorId);
  const token = await t
    .withIdentity(directorIdentity)
    .mutation(api.bulletinShareLinks.issue, { bulletinId, mode: "sign_in_required" });

  await expect(t.query(api.bulletinShareLinks.resolveForMember, { token })).rejects.toThrow(
    /Not signed in/,
  );
});
