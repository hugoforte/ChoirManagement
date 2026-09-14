import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

// Uses the storageState saved by e2e/auth.setup.ts (chromium-director
// project) — signed in as a Member with the "director" role. See
// docs/architecture/ci-cd-and-testing.md.
test("director can add a Piece to the Music Library and see it in the list", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  const title = `E2E Test Piece ${Date.now()}`;

  await page.goto("/library/manage");
  await page.getByPlaceholder("New Piece title").fill(title);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: title })).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

test("director can review and publish a mixed attachment batch", async ({ page, context }) => {
  await setupClerkTestingToken({ context });

  const title = `Attachment Batch ${Date.now()}`;
  await page.goto("/library/manage");
  await page.getByPlaceholder("New Piece title").fill(title);
  await page.getByLabel("Files for new Piece").setInputFiles([
    {
      name: `${title} score.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("test score"),
    },
    {
      name: `${title}.mscz`,
      mimeType: "application/vnd.musescore",
      buffer: Buffer.from("test source"),
    },
    {
      name: `${title} tenor.mp3`,
      mimeType: "audio/mpeg",
      buffer: Buffer.from("test rehearsal audio"),
    },
    {
      name: `${title} cover.png`,
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    },
  ]);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: "Add attachments" })).toBeVisible();

  const scoreRow = page.getByTestId("review-row-upload-1");
  const sourceRow = page.getByTestId("review-row-upload-2");
  const tenorRow = page.getByTestId("review-row-upload-3");
  await expect(scoreRow).toBeVisible();
  await expect(sourceRow).toBeVisible();
  await expect(tenorRow).toBeVisible();
  await expect(scoreRow.getByLabel(`Format for ${title} score.pdf`)).toHaveValue("pdf");
  await expect(scoreRow.getByLabel(`Purpose for ${title} score.pdf`)).toHaveValue("fullScore");
  await expect(scoreRow.getByLabel(/Primary score/)).toBeChecked();
  await expect(sourceRow.getByLabel(`Format for ${title}.mscz`)).toHaveValue("musescore");
  await expect(tenorRow.getByLabel(`Purpose for ${title} tenor.mp3`)).toHaveValue("partRehearsal");
  await expect(
    tenorRow.getByRole("checkbox", {
      name: `${title} tenor.mp3 Tenor`,
      exact: true,
    }),
  ).toBeChecked();

  await expect(page.getByText("Published attachments")).toHaveCount(0);
  const finish = page.getByRole("button", { name: "Finish" });
  await expect(finish).toBeEnabled();
  await finish.click();

  await expect(page.getByText("Published attachments")).toBeVisible();
  await expect(page.getByText(`${title} score.pdf — primary`)).toBeVisible();
  await expect(page.getByText(`${title}.mscz`)).toBeVisible();
  await expect(page.getByText(`${title} tenor.mp3`)).toBeVisible();
  await expect(page.getByText(`${title} cover.png`)).toBeVisible();

  await page.goto("/library");
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("main").getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open main score" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audio tracks", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Download .*Full Score\.pdf/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Download .*Editable Full Score\.mscz/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Download .*Part Rehearsal - Tenor\.mp3/ }),
  ).toBeVisible();
  await expect(page.locator("iframe[title^='Preview of']")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Part Rehearsal · Tenor" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Play selected tracks" })).toBeVisible();
  await expect(page.getByLabel("Playback position")).toBeVisible();
  await expect(page.locator("img[alt^='Preview of']")).toBeVisible();

  await page.getByRole("button", { name: "Tenor", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Part Rehearsal · Tenor" })).toBeChecked();
  await expect(
    page.getByRole("button", { name: /Download .*Editable Full Score\.mscz/ }),
  ).toBeVisible();
});
