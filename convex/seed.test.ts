/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

// seed.ts refuses to run unless the deployment is explicitly marked as
// holding throwaway data; convex-test reads the same process.env.
process.env.ALLOW_DEMO_SEED = "true";

test("demo seeds Pieces, Events, and Choir settings", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.demo, {});

  const pieces = await t.run(async (ctx) => await ctx.db.query("pieces").collect());
  const events = await t.run(async (ctx) => await ctx.db.query("events").collect());
  const settings = await t.run(async (ctx) => await ctx.db.query("choirSettings").first());

  expect(pieces).toHaveLength(3);
  expect(settings?.name).toContain("staging");
  // Every seeded Event must be in the future, otherwise the upcoming-Events
  // lists a reviewer opens the preview to check would render empty.
  expect(events).toHaveLength(2);
  for (const event of events) {
    expect(event.startsAt).toBeGreaterThan(Date.now());
  }
  expect(events.some((e) => e.visibility === "public")).toBe(true);
});

test("demo is idempotent", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.demo, {});
  await t.mutation(internal.seed.demo, {});

  const pieces = await t.run(async (ctx) => await ctx.db.query("pieces").collect());
  expect(pieces).toHaveLength(3);
});

test("upsertRoleMember creates a Member at the requested Role", async () => {
  const t = convexTest(schema, modules);
  const clerkUserId = "https://example.clerk.accounts.dev|user_director";

  await t.mutation(internal.seed.upsertRoleMember, {
    clerkUserId,
    name: "E2E Director",
    email: "e2e-director+clerk_test@example.com",
    role: "director",
  });

  const member = await t.run(async (ctx) => await ctx.db.query("members").unique());
  expect(member).toMatchObject({ clerkUserId, role: "director" });
});

test("upsertRoleMember is idempotent and corrects the Role in place", async () => {
  const t = convexTest(schema, modules);
  const clerkUserId = "https://example.clerk.accounts.dev|user_director";
  const base = { clerkUserId, name: "E2E Director", email: "d@example.com" } as const;

  const first = await t.mutation(internal.seed.upsertRoleMember, { ...base, role: "chorister" });
  const second = await t.mutation(internal.seed.upsertRoleMember, { ...base, role: "director" });

  expect(second).toBe(first);
  const members = await t.run(async (ctx) => await ctx.db.query("members").collect());
  expect(members).toHaveLength(1);
  expect(members[0].role).toBe("director");
});

// The whole point of seeding a Member rather than promoting one: signing in
// afterwards must not reset the seeded Role back to "chorister".
test("a seeded Role survives that user's first sign-in", async () => {
  const t = convexTest(schema, modules);
  const identity = {
    subject: "user_director",
    issuer: "https://example.clerk.accounts.dev",
    tokenIdentifier: "https://example.clerk.accounts.dev|user_director",
  };

  await t.mutation(internal.seed.upsertRoleMember, {
    clerkUserId: identity.tokenIdentifier,
    name: "Seeded Name",
    email: "seeded@example.com",
    role: "director",
  });

  await t
    .withIdentity({ ...identity, name: "Clerk Name", email: "clerk@example.com" })
    .mutation(api.members.ensureCurrentMember, {});

  const members = await t.run(async (ctx) => await ctx.db.query("members").collect());
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({
    role: "director",
    name: "Clerk Name",
    email: "clerk@example.com",
  });
});

test("seeding refuses to run when ALLOW_DEMO_SEED is not set", async () => {
  const t = convexTest(schema, modules);
  const previous = process.env.ALLOW_DEMO_SEED;
  process.env.ALLOW_DEMO_SEED = "false";
  try {
    await expect(t.mutation(internal.seed.demo, {})).rejects.toThrow(/ALLOW_DEMO_SEED/);
  } finally {
    process.env.ALLOW_DEMO_SEED = previous;
  }
});
