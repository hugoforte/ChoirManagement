/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const issuer = "https://example.clerk.accounts.dev";
const directorIdentity = { subject: "director_1", issuer };
const adminIdentity = { subject: "admin_1", issuer };
const choristerIdentity = { subject: "chorister_1", issuer };

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("members", {
      clerkUserId: `${issuer}|director_1`,
      name: "Dana Director",
      email: "dana@example.com",
      role: "director",
    });
    await ctx.db.insert("members", {
      clerkUserId: `${issuer}|admin_1`,
      name: "Alex Admin",
      email: "alex@example.com",
      role: "admin",
    });
    await ctx.db.insert("members", {
      clerkUserId: `${issuer}|chorister_1`,
      name: "Casey Chorister",
      email: "casey@example.com",
      role: "chorister",
    });
    const allPartId = await ctx.db.insert("voiceParts", {
      name: "All",
      normalizedName: "all",
      displayOrder: 0,
      status: "active",
      isAll: true,
      defaultKey: "all",
      updatedAt: 1,
    });
    const tenorPartId = await ctx.db.insert("voiceParts", {
      name: "Tenor",
      normalizedName: "tenor",
      displayOrder: 1,
      status: "active",
      isAll: false,
      defaultKey: "tenor",
      updatedAt: 1,
    });
    const archivedPartId = await ctx.db.insert("voiceParts", {
      name: "Archived",
      normalizedName: "archived",
      displayOrder: 2,
      status: "archived",
      isAll: false,
      updatedAt: 1,
    });
    const pieceId = await ctx.db.insert("pieces", {
      title: "Ave Verum",
      files: [],
    });
    const otherPieceId = await ctx.db.insert("pieces", {
      title: "Ubi Caritas",
      files: [],
    });
    return { allPartId, tenorPartId, archivedPartId, pieceId, otherPieceId };
  });
  return { t, ...ids };
}

async function store(
  t: Awaited<ReturnType<typeof setup>>["t"],
  contents = "pdf bytes",
) {
  return await t.run(
    async (ctx) =>
      await ctx.storage.store(
        new Blob([contents], { type: "application/pdf" }),
      ),
  );
}

function fullScore(storageId: string) {
  return {
    storageId: storageId as never,
    originalFilename: "ave-verum.pdf",
    format: "pdf" as const,
    purpose: "fullScore" as const,
    voicePartIds: [],
    isPrimary: true,
  };
}

test("a Director publishes a batch atomically and every Member can list it", async () => {
  const { t, pieceId, otherPieceId, tenorPartId } = await setup();
  const pdfId = await store(t);
  const rehearsalId = await store(t, "audio bytes");

  const createdIds = await t
    .withIdentity(directorIdentity)
    .mutation(api.pieceAttachments.publishBatch, {
      pieceId,
      attachments: [
        fullScore(pdfId),
        {
          storageId: rehearsalId,
          originalFilename: "ave-verum-tenor.mp3",
          format: "audio",
          purpose: "partRehearsal",
          voicePartIds: [tenorPartId],
          isPrimary: false,
          durationSeconds: 62.5,
          revisionNote: "Initial review",
        },
      ],
    });

  expect(createdIds).toHaveLength(2);
  const listed = await t
    .withIdentity(choristerIdentity)
    .query(api.pieceAttachments.listActive, { pieceId });
  expect(listed).toHaveLength(2);
  expect(listed[0]).toMatchObject({
    attachment: {
      format: "pdf",
      purpose: "fullScore",
      isPrimary: true,
      displayOrder: 0,
    },
    currentVersion: { revisionNumber: 1, originalFilename: "ave-verum.pdf" },
    voiceParts: [],
  });
  expect(listed[1].voiceParts.map((part) => part.name)).toEqual(["Tenor"]);
  expect(listed[0].url).not.toBeNull();
  expect(listed[1].currentVersion.durationSeconds).toBe(62.5);
  const managementDetail = await t
    .withIdentity(directorIdentity)
    .query(api.pieceAttachments.getManagementDetail, { pieceId });
  expect(managementDetail.piece._id).toBe(pieceId);
  expect(managementDetail.attachments).toHaveLength(2);
  const records = await t.run(
    async (ctx) => await ctx.db.query("pieceAttachments").collect(),
  );
  expect(records[0].createdByMemberId).toBeDefined();
  expect(records[1].updatedByMemberId).toBe(records[1].createdByMemberId);

  const memberDetail = await t
    .withIdentity(choristerIdentity)
    .query(api.pieceAttachments.getMemberDetail, { pieceId });
  if (!memberDetail) throw new Error("Expected Member Piece detail");
  expect(memberDetail.piece.title).toBe("Ave Verum");
  expect(memberDetail.attachments).toHaveLength(2);
  await t.run(async (ctx) => await ctx.db.delete("pieces", otherPieceId));
  expect(
    await t
      .withIdentity(choristerIdentity)
      .query(api.pieceAttachments.getMemberDetail, { pieceId: otherPieceId }),
  ).toBeNull();
});

test("management detail and all management mutations refuse a Chorister", async () => {
  const { t, pieceId } = await setup();
  const storageId = await store(t);

  await expect(
    t.query(api.pieceAttachments.listActive, { pieceId }),
  ).rejects.toThrow(/Not signed in/);

  await expect(
    t
      .withIdentity(choristerIdentity)
      .mutation(api.pieceAttachments.registerPendingUpload, {
        pieceId,
        storageId,
      }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
  await expect(
    t
      .withIdentity(choristerIdentity)
      .query(api.pieceAttachments.getManagementDetail, { pieceId }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
  await expect(
    t
      .withIdentity(choristerIdentity)
      .mutation(api.pieceAttachments.publishBatch, {
        pieceId,
        attachments: [fullScore(storageId)],
      }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
  await expect(
    t
      .withIdentity(choristerIdentity)
      .mutation(api.pieceAttachments.reorder, { pieceId, attachmentIds: [] }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
  await expect(
    t
      .withIdentity(choristerIdentity)
      .mutation(api.pieceAttachments.discardUnreferencedStorage, {
        storageIds: [storageId],
      }),
  ).rejects.toThrow(/Requires capability: manageLibrary/);
});

test("pending uploads register idempotently and are consumed by publication", async () => {
  const { t, pieceId, otherPieceId } = await setup();
  const storageId = await store(t);
  const director = t.withIdentity(directorIdentity);

  await director.mutation(api.pieceAttachments.registerPendingUpload, {
    pieceId,
    storageId,
  });
  await director.mutation(api.pieceAttachments.registerPendingUpload, {
    pieceId,
    storageId,
  });
  expect(
    await t.run(async (ctx) =>
      await ctx.db.query("pendingPieceUploads").take(2),
    ),
  ).toHaveLength(1);

  await expect(
    director.mutation(api.pieceAttachments.registerPendingUpload, {
      pieceId: otherPieceId,
      storageId,
    }),
  ).rejects.toThrow(/another batch/);

  await director.mutation(api.pieceAttachments.publishBatch, {
    pieceId,
    attachments: [fullScore(storageId)],
  });
  expect(
    await t.run(async (ctx) =>
      await ctx.db.query("pendingPieceUploads").take(2),
    ),
  ).toHaveLength(0);
});

test("pending upload cleanup is restricted to its uploader", async () => {
  const { t, pieceId } = await setup();
  const storageId = await store(t, "pending");
  const director = t.withIdentity(directorIdentity);
  const admin = t.withIdentity(adminIdentity);

  await director.mutation(api.pieceAttachments.registerPendingUpload, {
    pieceId,
    storageId,
  });
  await expect(
    admin.mutation(api.pieceAttachments.discardUnreferencedStorage, {
      storageIds: [storageId],
    }),
  ).rejects.toThrow(/another Member's pending upload/);

  await director.mutation(api.pieceAttachments.discardUnreferencedStorage, {
    storageIds: [storageId],
  });
  expect(
    await t.run(async (ctx) =>
      await ctx.db.query("pendingPieceUploads").take(2),
    ),
  ).toHaveLength(0);
  expect(await t.run(async (ctx) => await ctx.storage.getUrl(storageId))).toBeNull();
});

test("publication rejects bad storage and policy violations without metadata writes", async () => {
  const { t, pieceId, allPartId, tenorPartId, archivedPartId } = await setup();
  const storedId = await store(t);
  const missingStorageId = await store(t, "deleted before review");
  await t.run(async (ctx) => await ctx.storage.delete(missingStorageId));
  const director = t.withIdentity(directorIdentity);

  await expect(
    director.mutation(api.pieceAttachments.publishBatch, {
      pieceId,
      attachments: [
        fullScore(storedId),
        {
          ...fullScore(missingStorageId),
          originalFilename: "missing.pdf",
          isPrimary: false,
        },
      ],
    }),
  ).rejects.toThrow(/Uploaded file not found/);
  await expect(
    director.mutation(api.pieceAttachments.publishBatch, {
      pieceId,
      attachments: [
        { ...fullScore(storedId), format: "audio", purpose: "fullScore" },
      ],
    }),
  ).rejects.toThrow(/not allowed for format/);
  await expect(
    director.mutation(api.pieceAttachments.publishBatch, {
      pieceId,
      attachments: [
        {
          ...fullScore(storedId),
          purpose: "partScore",
          voicePartIds: [],
          isPrimary: false,
        },
      ],
    }),
  ).rejects.toThrow(/requires at least one voice part/);
  await expect(
    director.mutation(api.pieceAttachments.publishBatch, {
      pieceId,
      attachments: [
        {
          ...fullScore(storedId),
          purpose: "partScore",
          voicePartIds: [allPartId, tenorPartId],
          isPrimary: false,
        },
      ],
    }),
  ).rejects.toThrow(/All cannot be combined/);
  await expect(
    director.mutation(api.pieceAttachments.publishBatch, {
      pieceId,
      attachments: [
        {
          ...fullScore(storedId),
          purpose: "partScore",
          voicePartIds: [archivedPartId],
          isPrimary: false,
        },
      ],
    }),
  ).rejects.toThrow(/Voice part is archived/);

  const attachments = await t.run(
    async (ctx) => await ctx.db.query("pieceAttachments").collect(),
  );
  const versions = await t.run(
    async (ctx) => await ctx.db.query("pieceFileVersions").collect(),
  );
  expect(attachments).toHaveLength(0);
  expect(versions).toHaveLength(0);
});

test("primary, ownership, current revision, and exact-set reorder invariants are enforced", async () => {
  const { t, pieceId, otherPieceId } = await setup();
  const firstId = await store(t, "first");
  const secondId = await store(t, "second");
  const otherId = await store(t, "other");
  const director = t.withIdentity(directorIdentity);
  const [firstAttachmentId, secondAttachmentId] = await director.mutation(
    api.pieceAttachments.publishBatch,
    {
      pieceId,
      attachments: [
        fullScore(firstId),
        {
          ...fullScore(secondId),
          originalFilename: "alternate.pdf",
          isPrimary: false,
        },
      ],
    },
  );
  const [otherAttachmentId] = await director.mutation(
    api.pieceAttachments.publishBatch,
    {
      pieceId: otherPieceId,
      attachments: [fullScore(otherId)],
    },
  );

  await expect(
    director.mutation(api.pieceAttachments.updateMetadata, {
      pieceId,
      attachmentId: secondAttachmentId,
      format: "pdf",
      purpose: "fullScore",
      voicePartIds: [],
      isPrimary: true,
    }),
  ).rejects.toThrow(/only one primary score/);
  await expect(
    director.mutation(api.pieceAttachments.updateMetadata, {
      pieceId,
      attachmentId: secondAttachmentId,
      format: "audio",
      purpose: "fullMix",
      voicePartIds: [],
      isPrimary: true,
    }),
  ).rejects.toThrow(/Only a full-score PDF/);
  await expect(
    director.mutation(api.pieceAttachments.updateMetadata, {
      pieceId,
      attachmentId: otherAttachmentId,
      format: "pdf",
      purpose: "fullScore",
      voicePartIds: [],
      isPrimary: false,
    }),
  ).rejects.toThrow(/not found for this Piece/);
  await expect(
    director.mutation(api.pieceAttachments.reorder, {
      pieceId,
      attachmentIds: [firstAttachmentId, otherAttachmentId],
    }),
  ).rejects.toThrow(/exactly this Piece/);
  await expect(
    director.mutation(api.pieceAttachments.reorder, {
      pieceId,
      attachmentIds: [firstAttachmentId],
    }),
  ).rejects.toThrow(/exactly this Piece/);

  await director.mutation(api.pieceAttachments.reorder, {
    pieceId,
    attachmentIds: [secondAttachmentId, firstAttachmentId],
  });
  const reordered = await director.query(api.pieceAttachments.listActive, {
    pieceId,
  });
  expect(reordered.map((entry) => entry.attachment._id)).toEqual([
    secondAttachmentId,
    firstAttachmentId,
  ]);
});

test("metadata updates preserve existing archived-part assignments and reject new ones", async () => {
  const { t, pieceId, tenorPartId, archivedPartId } = await setup();
  const storageId = await store(t, "tenor audio");
  const director = t.withIdentity(directorIdentity);
  const [attachmentId] = await director.mutation(
    api.pieceAttachments.publishBatch,
    {
      pieceId,
      attachments: [
        {
          storageId,
          originalFilename: "ave-verum-tenor.mp3",
          format: "audio",
          purpose: "partRehearsal",
          voicePartIds: [tenorPartId],
          isPrimary: false,
        },
      ],
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.patch("voiceParts", tenorPartId, { status: "archived" });
  });

  await director.mutation(api.pieceAttachments.updateMetadata, {
    pieceId,
    attachmentId,
    format: "audio",
    purpose: "partRehearsal",
    voicePartIds: [tenorPartId],
    label: "Tenor practice",
    isPrimary: false,
  });
  await expect(
    director.mutation(api.pieceAttachments.updateMetadata, {
      pieceId,
      attachmentId,
      format: "audio",
      purpose: "partRehearsal",
      voicePartIds: [tenorPartId, archivedPartId],
      isPrimary: false,
    }),
  ).rejects.toThrow(/Voice part is archived/);

  await director.mutation(api.pieceAttachments.updateMetadata, {
    pieceId,
    attachmentId,
    format: "audio",
    purpose: "partRehearsal",
    voicePartIds: [tenorPartId],
    label: "",
    isPrimary: false,
  });

  const detail = await director.query(
    api.pieceAttachments.getManagementDetail,
    { pieceId },
  );
  expect(detail.attachments[0].attachment).toMatchObject({
    voicePartIds: [tenorPartId],
  });
  expect(detail.attachments[0].attachment.label).toBeUndefined();
});

test("metadata updates reject a current revision belonging to another attachment", async () => {
  const { t, pieceId } = await setup();
  const firstStorageId = await store(t, "first revision");
  const secondStorageId = await store(t, "second revision");
  const director = t.withIdentity(directorIdentity);
  const [firstAttachmentId, secondAttachmentId] = await director.mutation(
    api.pieceAttachments.publishBatch,
    {
      pieceId,
      attachments: [
        fullScore(firstStorageId),
        {
          ...fullScore(secondStorageId),
          originalFilename: "alternate.pdf",
          isPrimary: false,
        },
      ],
    },
  );
  await t.run(async (ctx) => {
    const firstVersion = await ctx.db
      .query("pieceFileVersions")
      .withIndex("by_attachment_id_and_revision_number", (q) =>
        q.eq("attachmentId", firstAttachmentId),
      )
      .unique();
    if (!firstVersion) throw new Error("Expected first revision");
    await ctx.db.patch("pieceAttachments", secondAttachmentId, {
      currentVersionId: firstVersion._id,
    });
  });

  await expect(
    director.mutation(api.pieceAttachments.updateMetadata, {
      pieceId,
      attachmentId: secondAttachmentId,
      format: "pdf",
      purpose: "fullScore",
      voicePartIds: [],
      isPrimary: false,
    }),
  ).rejects.toThrow(/belongs to another attachment/);
});

test("publication refuses a storage object already used by a revision", async () => {
  const { t, pieceId, otherPieceId } = await setup();
  const storageId = await store(t);
  const director = t.withIdentity(directorIdentity);
  await director.mutation(api.pieceAttachments.publishBatch, {
    pieceId,
    attachments: [fullScore(storageId)],
  });

  await expect(
    director.mutation(api.pieceAttachments.publishBatch, {
      pieceId: otherPieceId,
      attachments: [{ ...fullScore(storageId), isPrimary: false }],
    }),
  ).rejects.toThrow(/already referenced by a revision/);
});

test("a filename collision can publish atomically as a new revision", async () => {
  const { t, pieceId } = await setup();
  const firstStorageId = await store(t, "first revision");
  const replacementStorageId = await store(t, "replacement revision");
  const director = t.withIdentity(directorIdentity);
  const [attachmentId] = await director.mutation(
    api.pieceAttachments.publishBatch,
    {
      pieceId,
      attachments: [fullScore(firstStorageId)],
    },
  );
  await director.mutation(api.pieceAttachments.registerPendingUpload, {
    pieceId,
    storageId: replacementStorageId,
  });

  const publishedIds = await director.mutation(
    api.pieceAttachments.publishBatch,
    {
      pieceId,
      attachments: [
        {
          ...fullScore(replacementStorageId),
          originalFilename: "ave-verum-revised.pdf",
          replaceAttachmentId: attachmentId,
        },
      ],
    },
  );

  expect(publishedIds).toEqual([attachmentId]);
  const detail = await director.query(
    api.pieceAttachments.getManagementDetail,
    { pieceId },
  );
  expect(detail.attachments).toHaveLength(1);
  expect(detail.attachments[0].currentVersion).toMatchObject({
    revisionNumber: 2,
    originalFilename: "ave-verum-revised.pdf",
  });
  const versions = await t.run(async (ctx) =>
    await ctx.db
      .query("pieceFileVersions")
      .withIndex("by_attachment_id_and_revision_number", (q) =>
        q.eq("attachmentId", attachmentId),
      )
      .take(3),
  );
  expect(versions.map((version) => version.revisionNumber)).toEqual([1, 2]);
  expect(
    await t.run(async (ctx) =>
      await ctx.db.query("pendingPieceUploads").take(1),
    ),
  ).toHaveLength(0);
});

test("discard refuses referenced storage and deletes an unreferenced upload", async () => {
  const { t, pieceId } = await setup();
  const referencedId = await store(t, "referenced");
  const legacyId = await store(t, "legacy");
  const logoId = await store(t, "logo");
  const unreferencedId = await store(t, "unreferenced");
  const director = t.withIdentity(adminIdentity);
  await director.mutation(api.pieceAttachments.publishBatch, {
    pieceId,
    attachments: [fullScore(referencedId)],
  });
  await t.run(async (ctx) => {
    await ctx.db.patch("pieces", pieceId, {
      files: [{ storageId: legacyId, filename: "legacy.pdf", kind: "pdf" }],
    });
    await ctx.db.insert("choirSettings", {
      name: "Test Choir",
      logoStorageId: logoId,
    });
  });

  await expect(
    director.mutation(api.pieceAttachments.discardUnreferencedStorage, {
      storageIds: [referencedId],
    }),
  ).rejects.toThrow(/referenced by an attachment revision/);
  await expect(
    director.mutation(api.pieceAttachments.discardUnreferencedStorage, {
      storageIds: [legacyId],
    }),
  ).rejects.toThrow(/referenced outside Piece attachments/);
  await expect(
    director.mutation(api.pieceAttachments.discardUnreferencedStorage, {
      storageIds: [logoId],
    }),
  ).rejects.toThrow(/referenced outside Piece attachments/);
  await director.mutation(api.pieceAttachments.discardUnreferencedStorage, {
    storageIds: [unreferencedId],
  });
  const discardedUrl = await t.run(
    async (ctx) => await ctx.storage.getUrl(unreferencedId),
  );
  expect(discardedUrl).toBeNull();
});
