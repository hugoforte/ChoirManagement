/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const adminIdentity = { subject: "admin_1", issuer: "https://example.clerk.accounts.dev" };
const memberIdentity = { subject: "member_1", issuer: "https://example.clerk.accounts.dev" };

async function seedMember(
  t: ReturnType<typeof convexTest>,
  identity: { subject: string; issuer: string },
  role: "admin" | "director" | "chorister",
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: `${identity.issuer}|${identity.subject}`,
      name: role,
      email: `${role}@example.com`,
      role,
    });
  });
}

test("update creates the singleton when none exists, get resolves it back", async () => {
  const t = convexTest(schema, modules);
  await seedMember(t, adminIdentity, "admin");

  await t.withIdentity(adminIdentity).mutation(api.choirSettings.update, {
    name: "Riverside Choir",
    description: "A friendly choir.",
    contactEmail: "hello@example.com",
  });

  const settings = await t.withIdentity(adminIdentity).query(api.choirSettings.get, {});
  expect(settings).toMatchObject({
    name: "Riverside Choir",
    description: "A friendly choir.",
    contactEmail: "hello@example.com",
    logoUrl: null,
  });
});

test("update refuses a non-admin Member", async () => {
  const t = convexTest(schema, modules);
  await seedMember(t, memberIdentity, "director");

  await expect(
    t.withIdentity(memberIdentity).mutation(api.choirSettings.update, { name: "Nope" }),
  ).rejects.toThrow();
});

test("replacing the logo deletes the old storage file", async () => {
  const t = convexTest(schema, modules);
  await seedMember(t, adminIdentity, "admin");
  const asAdmin = t.withIdentity(adminIdentity);

  const oldStorageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["old"])));
  await asAdmin.mutation(api.choirSettings.update, { name: "Choir", logoStorageId: oldStorageId });

  const newStorageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["new"])));
  await asAdmin.mutation(api.choirSettings.update, { name: "Choir", logoStorageId: newStorageId });

  const oldUrl = await t.run(async (ctx) => await ctx.storage.getUrl(oldStorageId));
  expect(oldUrl).toBeNull();

  const settings = await asAdmin.query(api.choirSettings.get, {});
  expect(settings?.logoStorageId).toBe(newStorageId);
  expect(settings?.logoUrl).not.toBeNull();
});

test("generateLogoUploadUrl refuses a non-admin Member", async () => {
  const t = convexTest(schema, modules);
  await seedMember(t, memberIdentity, "chorister");

  await expect(t.withIdentity(memberIdentity).mutation(api.choirSettings.generateLogoUploadUrl, {})).rejects.toThrow();
});
