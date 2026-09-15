import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { asMutation } from "../../test/convexMocks";
import { PublishControl } from "./PublishControl";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const bulletinId = "bulletin_1" as Id<"bulletins">;
const publish = vi.fn();

function renderControl(emailConfigured: boolean | undefined) {
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.bulletinEmails.isConfigured)) return emailConfigured;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(<PublishControl bulletinId={bulletinId} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useMutation).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.bulletins.publish)) return asMutation(publish);
    throw new Error(`Unexpected useMutation call: ${name}`);
  }) as typeof useMutation);
});

afterEach(cleanup);

const CHECKBOX = "Email this Bulletin to the roster";

test("the email checkbox is offered, and checked, on a configured deployment", () => {
  renderControl(true);
  expect(screen.getByLabelText(CHECKBOX)).toBeChecked();
});

test("publishing with the box ticked asks for the email", async () => {
  renderControl(true);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  });

  expect(publish).toHaveBeenCalledWith({ bulletinId, sendEmail: true });
});

// A Director publishing a minor correction must be able to skip the email —
// this is the whole reason sending is an explicit choice (#52).
test("unticking the box publishes without emailing anyone", async () => {
  renderControl(true);

  await act(async () => {
    fireEvent.click(screen.getByLabelText(CHECKBOX));
  });
  expect(screen.getByLabelText(CHECKBOX)).not.toBeChecked();

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  });

  expect(publish).toHaveBeenCalledWith({ bulletinId, sendEmail: false });
});

test("an unconfigured deployment explains itself instead of offering the checkbox", () => {
  renderControl(false);

  expect(screen.queryByLabelText(CHECKBOX)).toBeNull();
  expect(screen.getByText(/Email is not configured for this deployment/)).toBeVisible();
});

test("publishing on an unconfigured deployment never asks for an email", async () => {
  renderControl(false);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  });

  expect(publish).toHaveBeenCalledWith({ bulletinId, sendEmail: false });
});

// Publishing is still reachable while the configuration query is in flight;
// it just can't promise an email yet.
test("neither the checkbox nor the explanation appears while the query is loading", () => {
  renderControl(undefined);

  expect(screen.queryByLabelText(CHECKBOX)).toBeNull();
  expect(screen.queryByText(/Email is not configured/)).toBeNull();
  expect(screen.getByRole("button", { name: "Publish" })).toBeVisible();
});
