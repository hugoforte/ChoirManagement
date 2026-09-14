// The Share Link panel (#83, ADR-0004). The behaviour worth pinning is the
// guard rails: a draft can't be shared, and regenerating — which cuts off
// every URL already sent out — doesn't happen without a confirmation.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { asMutation } from "../../test/convexMocks";
import { ShareLinkPanel } from "./ShareLinkPanel";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const bulletinId = "bulletin_1" as Id<"bulletins">;

const mutations = {
  issue: vi.fn(),
  setMode: vi.fn(),
  regenerate: vi.fn(),
  revoke: vi.fn(),
};

function renderPanel(
  shareLink: { token: string; mode: "token" | "sign_in_required" } | null | undefined,
  { published = true } = {},
) {
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.bulletinShareLinks.get)) return shareLink;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(<ShareLinkPanel bulletinId={bulletinId} published={published} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useMutation).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.bulletinShareLinks.issue)) return asMutation(mutations.issue);
    if (name === getFunctionName(api.bulletinShareLinks.setMode)) return asMutation(mutations.setMode);
    if (name === getFunctionName(api.bulletinShareLinks.regenerate)) return asMutation(mutations.regenerate);
    if (name === getFunctionName(api.bulletinShareLinks.revoke)) return asMutation(mutations.revoke);
    throw new Error(`Unexpected useMutation call: ${name}`);
  }) as typeof useMutation);
});

afterEach(cleanup);

describe("ShareLinkPanel", () => {
  test("refuses to share a draft, and says why", () => {
    renderPanel(null, { published: false });

    expect(screen.getByText(/A draft can't be shared/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create token link" })).not.toBeInTheDocument();
  });

  test("offers both modes when no Share Link exists yet", () => {
    renderPanel(null);

    expect(screen.getByRole("button", { name: "Create sign-in link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create token link" })).toBeInTheDocument();
  });

  test("issues a token link in token mode", async () => {
    renderPanel(null);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create token link" }));
    });

    expect(mutations.issue).toHaveBeenCalledWith({ bulletinId, mode: "token" });
  });

  test("shows the full URL a recipient would open", () => {
    renderPanel({ token: "tok_abc", mode: "token" });

    expect(screen.getByLabelText("Share Link URL")).toHaveValue(`${window.location.origin}/s/tok_abc`);
  });

  test("warns that a token link is readable by anyone it reaches", () => {
    renderPanel({ token: "tok_abc", mode: "token" });

    expect(screen.getByText(/without an account/)).toBeInTheDocument();
  });

  test("regenerates only after the warning is accepted", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel({ token: "tok_abc", mode: "token" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    });

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("stops working"));
    expect(mutations.regenerate).toHaveBeenCalledWith({ bulletinId });
  });

  test("leaves the current URL working when the warning is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel({ token: "tok_abc", mode: "token" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    });

    expect(mutations.regenerate).not.toHaveBeenCalled();
  });

  test("changes mode without changing the URL", async () => {
    renderPanel({ token: "tok_abc", mode: "token" });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Who can open it"), { target: { value: "sign_in_required" } });
    });

    expect(mutations.setMode).toHaveBeenCalledWith({ bulletinId, mode: "sign_in_required" });
  });

  test("revokes the Share Link", async () => {
    renderPanel({ token: "tok_abc", mode: "token" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    });

    expect(mutations.revoke).toHaveBeenCalledWith({ bulletinId });
  });

  test("confirms a copy only when the clipboard accepted it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderPanel({ token: "tok_abc", mode: "token" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/tok_abc`);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  test("does not claim a copy the clipboard refused", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    renderPanel({ token: "tok_abc", mode: "token" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
