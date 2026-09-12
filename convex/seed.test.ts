/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

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

test("promoteReviewer makes an existing Member an admin", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: "user_reviewer",
      name: "Reviewer",
      email: "reviewer@example.com",
      role: "chorister",
    });
  });

  await t.mutation(internal.seed.promoteReviewer, { email: "reviewer@example.com" });

  const member = await t.run(async (ctx) => await ctx.db.query("members").first());
  expect(member?.role).toBe("admin");
});

test("promoteReviewer refuses an unknown email", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(internal.seed.promoteReviewer, { email: "nobody@example.com" }),
  ).rejects.toThrow(/No Member found/);
});
