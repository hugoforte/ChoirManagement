/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const directorIdentity = { subject: "director_1", issuer: "https://example.clerk.accounts.dev" };
const choristerIdentity = { subject: "chorister_1", issuer: "https://example.clerk.accounts.dev" };

async function seedMembers(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: "https://example.clerk.accounts.dev|director_1",
      name: "Dana Director",
      email: "dana@example.com",
      role: "director",
    });
    await ctx.db.insert("members", {
      clerkUserId: "https://example.clerk.accounts.dev|chorister_1",
      name: "Chris Chorister",
      email: "chris@example.com",
      role: "chorister",
    });
  });
}

test("director can create, attach a file, and remove a Piece", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);

  const pieceId = await asDirector.mutation(api.pieces.create, { title: "Ave Verum Corpus" });

  const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["fake pdf bytes"])));
  await asDirector.mutation(api.pieces.attachFile, {
    pieceId,
    storageId,
    filename: "ave-verum.pdf",
    kind: "pdf",
  });

  const piece = await asDirector.query(api.pieces.get, { pieceId });
  expect(piece?.files).toHaveLength(1);
  expect(piece?.files[0]).toMatchObject({ filename: "ave-verum.pdf", kind: "pdf" });
  expect(piece?.files[0].url).not.toBeNull();

  await asDirector.mutation(api.pieces.detachFile, { pieceId, storageId });
  const afterDetach = await asDirector.query(api.pieces.get, { pieceId });
  expect(afterDetach?.files).toHaveLength(0);

  await asDirector.mutation(api.pieces.remove, { pieceId });
  const afterRemove = await asDirector.query(api.pieces.get, { pieceId });
  expect(afterRemove).toBeNull();
});

test("a Chorister can list and view Pieces but cannot create one", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const asChorister = t.withIdentity(choristerIdentity);

  await asDirector.mutation(api.pieces.create, { title: "Ubi Caritas" });

  const list = await asChorister.query(api.pieces.list, {});
  expect(list).toHaveLength(1);
  expect(list[0].title).toBe("Ubi Caritas");

  await expect(asChorister.mutation(api.pieces.create, { title: "Not allowed" })).rejects.toThrow(
    /Requires capability: manageLibrary/,
  );
});

test("update refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await asDirector.mutation(api.pieces.create, { title: "Ubi Caritas" });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.pieces.update, { pieceId, title: "Renamed" }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
});

test("remove refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await asDirector.mutation(api.pieces.create, { title: "Ubi Caritas" });

  await expect(t.withIdentity(choristerIdentity).mutation(api.pieces.remove, { pieceId })).rejects.toThrow(
    /Requires capability: manageLibrary/,
  );
});

test("generateUploadUrl refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);

  await expect(t.withIdentity(choristerIdentity).mutation(api.pieces.generateUploadUrl, {})).rejects.toThrow(
    /Requires capability: manageLibrary/,
  );
});

test("attachFile refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await asDirector.mutation(api.pieces.create, { title: "Ubi Caritas" });
  const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["fake pdf bytes"])));

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.pieces.attachFile, {
      pieceId,
      storageId,
      filename: "ubi-caritas.pdf",
      kind: "pdf",
    }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
});

test("detachFile refuses a Chorister", async () => {
  const t = convexTest(schema, modules);
  await seedMembers(t);
  const asDirector = t.withIdentity(directorIdentity);
  const pieceId = await asDirector.mutation(api.pieces.create, { title: "Ubi Caritas" });
  const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["fake pdf bytes"])));
  await asDirector.mutation(api.pieces.attachFile, {
    pieceId,
    storageId,
    filename: "ubi-caritas.pdf",
    kind: "pdf",
  });

  await expect(
    t.withIdentity(choristerIdentity).mutation(api.pieces.detachFile, { pieceId, storageId }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
});
