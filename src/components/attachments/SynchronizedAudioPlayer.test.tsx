import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PresentedAttachment } from "../../lib/attachmentPresentation";
import { SynchronizedAudioPlayer } from "./SynchronizedAudioPlayer";

function audioAttachment(id: string, displayName: string): PresentedAttachment {
  return {
    id,
    format: "audio",
    purpose: "partRehearsal",
    parts: [],
    partLabel: id === "soprano" ? "Soprano" : "Alto",
    manualOrder: 0,
    isPrimary: false,
    label: displayName,
    displayName,
    downloadName: displayName,
    preview: {
      kind: "audio",
      url: `https://files.example/${id}.mp3`,
      available: true,
    },
    download: {
      filename: displayName,
      url: `https://files.example/${id}.mp3`,
      available: true,
    },
    durationSeconds: 90,
    updatedAt: 1_700_000_000_000,
  };
}

const attachments = [
  audioAttachment("soprano", "Soprano rehearsal.mp3"),
  audioAttachment("alto", "Alto rehearsal.mp3"),
];

let playedElements: HTMLMediaElement[];

beforeEach(() => {
  playedElements = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    playedElements.push(this);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SynchronizedAudioPlayer", () => {
  it("uses checkboxes and one shared playback control", () => {
    render(<SynchronizedAudioPlayer attachments={attachments} />);

    expect(screen.getByRole("checkbox", { name: "Soprano rehearsal.mp3" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Alto rehearsal.mp3" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Play selected tracks" })).toBeInTheDocument();
    expect(document.querySelectorAll("audio[controls]")).toHaveLength(0);
  });

  it("starts selected tracks together and corrects playback drift", async () => {
    render(<SynchronizedAudioPlayer attachments={attachments} />);
    const sources = screen.getAllByTestId(/^audio-source-/u) as HTMLAudioElement[];

    fireEvent.click(screen.getByRole("checkbox", { name: "Alto rehearsal.mp3" }));
    fireEvent.click(screen.getByRole("button", { name: "Play selected tracks" }));

    await waitFor(() => expect(playedElements).toEqual(sources));
    expect(sources[0].currentTime).toBe(0);
    expect(sources[1].currentTime).toBe(0);

    sources[0].currentTime = 12;
    sources[1].currentTime = 3;
    fireEvent.timeUpdate(sources[0]);

    expect(sources[1].currentTime).toBe(12);
    expect(screen.getByRole("button", { name: "Pause selected tracks" })).toBeInTheDocument();
  });

  it("does not interrupt pending selected-track play requests when playback state renders", async () => {
    vi.restoreAllMocks();
    const pendingPlays = new Map<
      HTMLMediaElement,
      { resolve: () => void; reject: (reason: unknown) => void }
    >();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      return new Promise<void>((resolve, reject) => {
        pendingPlays.set(this, { resolve, reject });
      });
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      const pending = pendingPlays.get(this);
      if (!pending) return;
      pendingPlays.delete(this);
      pending.reject(new DOMException("The play() request was interrupted by pause().", "AbortError"));
    });

    render(<SynchronizedAudioPlayer attachments={attachments} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Alto rehearsal.mp3" }));
    fireEvent.click(screen.getByRole("button", { name: "Play selected tracks" }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      screen.queryByText("The selected tracks could not all be played. Try selecting them again."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause selected tracks" })).toBeInTheDocument();
    expect(pendingPlays.size).toBe(2);

    for (const pending of pendingPlays.values()) pending.resolve();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pause selected tracks" })).toBeInTheDocument(),
    );
  });
});
