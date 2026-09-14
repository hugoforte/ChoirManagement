import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import PieceDetail from "./PieceDetail";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));
vi.mock("../design/MemberPage", () => ({
  MemberPage: ({ children }: { children: () => React.ReactNode }) => <>{children()}</>,
  usePageTitle: vi.fn(),
}));

const all = { _id: "part-all", name: "All", displayOrder: 0, isAll: true };
const soprano = { _id: "part-s", name: "Soprano", displayOrder: 1, isAll: false };
const alto = { _id: "part-a", name: "Alto", displayOrder: 2, isAll: false };
const tenor = { _id: "part-t", name: "Tenor", displayOrder: 3, isAll: false };

function attachment(
  id: string,
  {
    format = "pdf",
    purpose = "other",
    parts = [],
    displayOrder = 0,
    isPrimary = false,
    filename = `${id}.pdf`,
    filenameOverride = filename,
    url = `https://files.example/${id}`,
    durationSeconds,
  }: {
    format?: string;
    purpose?: string;
    parts?: Array<typeof all | typeof soprano | typeof alto | typeof tenor>;
    displayOrder?: number;
    isPrimary?: boolean;
    filename?: string;
    filenameOverride?: string;
    url?: string | null;
    durationSeconds?: number;
  } = {},
) {
  return {
    attachment: {
      _id: `attachment-${id}`,
      format,
      purpose,
      voicePartIds: parts.map((part) => part._id),
      displayOrder,
      isPrimary,
      filenameOverride,
      updatedAt: 1_700_000_000_000,
    },
    currentVersion: {
      originalFilename: filename,
      durationSeconds,
      uploadedAt: 1_700_000_000_000,
    },
    voiceParts: parts,
    url,
  };
}

let memberDetail: unknown;
let pieceRemarks: unknown;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/library/piece-1"]}>
      <Routes>
        <Route path="/library/:pieceId" element={<PieceDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  memberDetail = {
    piece: {
      _id: "piece-1",
      title: "Ode to Joy",
      composer: "Beethoven",
      arranger: "Choir arrangement",
      notes: "Bring a pencil.",
      youtubeUrl: "https://youtube.example/watch",
    },
    attachments: [],
  };
  pieceRemarks = [];
  // Compare with getFunctionName, never === : api.foo.bar is a fresh Proxy
  // on every access (see src/test/convexMocks.ts).
  vi.mocked(useQuery).mockImplementation(((reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === getFunctionName(api.bulletinRemarks.listForPiece)) return pieceRemarks;
    expect(name).toBe(getFunctionName(api.pieceAttachments.getMemberDetail));
    return memberDetail;
  }) as typeof useQuery);
});

describe("PieceDetail", () => {
  it("shows the existing Piece details and an empty structured attachment state", () => {
    renderDetail();

    expect(screen.getByRole("heading", { name: "Ode to Joy" })).toBeInTheDocument();
    expect(screen.getByText("Bring a pencil.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reference recording (YouTube)" })).toHaveAttribute(
      "href",
      "https://youtube.example/watch",
    );
    expect(screen.getByText("No files attached.")).toBeInTheDocument();
  });

  it("groups, filters, previews, downloads, and safely degrades current attachments", () => {
    memberDetail = {
      piece: { _id: "piece-1", title: "Ode to Joy", composer: "Beethoven" },
      attachments: [
        attachment("main", {
          purpose: "fullScore",
          parts: [all],
          isPrimary: true,
          filename: "Ode to Joy.pdf",
          filenameOverride: "Main score.pdf",
        }),
        attachment("soprano", {
          format: "audio",
          purpose: "partRehearsal",
          parts: [soprano],
          displayOrder: 2,
          filename: "Soprano.mp3",
          filenameOverride: "Soprano rehearsal.mp3",
          durationSeconds: 92,
        }),
        attachment("alto-tenor", {
          format: "audio",
          purpose: "partRehearsal",
          parts: [alto, tenor],
          displayOrder: 1,
          filename: "Alto Tenor.mp3",
          filenameOverride: "Alto + Tenor rehearsal.mp3",
        }),
        attachment("cover", {
          format: "image",
          purpose: "other",
          filename: "Cover.png",
          filenameOverride: "Cover image.png",
        }),
        attachment("source", {
          format: "musescore",
          purpose: "editableFullScore",
          filename: "Source.mscz",
          filenameOverride: "Editable score.mscz",
        }),
        attachment("missing", {
          purpose: "lyricsText",
          filename: "Lyrics.pdf",
          filenameOverride: "Unavailable lyrics.pdf",
          url: null,
        }),
      ],
    };

    renderDetail();

    expect(screen.getByRole("link", { name: "Open main score" })).toHaveAttribute(
      "href",
      "https://files.example/main",
    );
    expect(screen.getByRole("heading", { name: "Scores & text" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audio tracks" })).toBeInTheDocument();
    expect(screen.getByText("Parts: Alto + Tenor")).toBeInTheDocument();
    expect(screen.getByText("Duration: 1:32")).toBeInTheDocument();
    const scoreWorkspace = screen.getByTestId("score-workspace");
    expect(scoreWorkspace.querySelector("iframe[title='Preview of Main score.pdf']")).not.toBeNull();
    const audioPlayers = screen.getByTestId("audio-rail").querySelectorAll("audio");
    expect(audioPlayers).toHaveLength(2);
    expect([...audioPlayers].every((player) => !player.controls)).toBe(true);
    expect(screen.getAllByRole("checkbox", { name: /rehearsal$/u })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Play selected tracks" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Preview of Cover image.png" })).toHaveAttribute(
      "src",
      "https://files.example/cover",
    );
    expect(screen.getByText("Download only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download Main score.pdf" })).toBeInTheDocument();
    expect(screen.getByText("This file is currently unavailable.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Download Unavailable lyrics.pdf" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Soprano" }));

    expect(screen.getByRole("button", { name: "Soprano" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Soprano rehearsal")).toBeInTheDocument();
    expect(screen.queryByText("Alto + Tenor rehearsal")).not.toBeInTheDocument();
    expect(screen.getByTestId("audio-rail").querySelectorAll("audio")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Soprano rehearsal" })).toBeChecked();
    expect(screen.getByText("Main score.pdf")).toBeInTheDocument();
  });

  it("shows a muted placeholder instead of a large dashed box when there is no main score", () => {
    memberDetail = {
      piece: { _id: "piece-1", title: "Ode to Joy", composer: "Beethoven" },
      attachments: [
        attachment("soprano", {
          format: "audio",
          purpose: "partRehearsal",
          parts: [soprano],
          filename: "Soprano.mp3",
          filenameOverride: "Soprano rehearsal.mp3",
        }),
      ],
    };

    renderDetail();

    expect(screen.getByText("No main score yet.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Main score" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audio tracks" })).toBeInTheDocument();
  });

  it("lists Remarks from published Bulletins, dated and linked back to their Bulletin", () => {
    pieceRemarks = [
      {
        _id: "remark-2",
        bulletinId: "bulletin-2",
        bulletinTitle: "Rehearsal 12 March",
        publishedAt: new Date(2026, 2, 12, 21, 30).getTime(),
        text: "Watch the tempo at bar 42.",
      },
      {
        _id: "remark-1",
        bulletinId: "bulletin-1",
        bulletinTitle: "Rehearsal 5 March",
        publishedAt: new Date(2026, 2, 5, 21, 15).getTime(),
        text: "Sopranos, breathe before the reprise.",
      },
    ];

    renderDetail();

    expect(screen.getByRole("heading", { name: "Remarks from Bulletins" })).toBeInTheDocument();
    expect(screen.getByText("Watch the tempo at bar 42.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rehearsal 12 March" })).toHaveAttribute(
      "href",
      "/bulletins/bulletin-2",
    );
    expect(screen.getByText("2026-03-05 21:15")).toBeInTheDocument();
  });

  it("shows no Remarks section when the Piece has none from a published Bulletin", () => {
    renderDetail();

    expect(
      screen.queryByRole("heading", { name: "Remarks from Bulletins" }),
    ).not.toBeInTheDocument();
  });

  it("gives every PDF card in Other files an Open link next to Download", () => {
    memberDetail = {
      piece: { _id: "piece-1", title: "Ode to Joy", composer: "Beethoven" },
      attachments: [
        attachment("lyrics", {
          purpose: "lyricsText",
          filename: "Lyrics.pdf",
          filenameOverride: "Lyrics sheet.pdf",
        }),
      ],
    };

    renderDetail();

    const openLink = screen.getByRole("link", { name: "Open Lyrics sheet.pdf" });
    expect(openLink).toHaveAttribute("href", "https://files.example/lyrics");
    expect(openLink).toHaveAttribute("target", "_blank");
    expect(openLink).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("button", { name: "Download Lyrics sheet.pdf" })).toBeInTheDocument();
  });
});
