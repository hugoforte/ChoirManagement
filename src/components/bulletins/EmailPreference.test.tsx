import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import { asMutation } from "../../test/convexMocks";
import { EmailPreference } from "./EmailPreference";

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const setEmailBulletins = vi.fn();
const TOGGLE = "Email me published Bulletins";

// `emailConfigured` is always stated, never defaulted: undefined is the
// loading state and is one of the cases under test.
function renderToggle(enabled: boolean, emailConfigured: boolean | undefined) {
  vi.mocked(useQuery).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.bulletinEmails.isConfigured)) return emailConfigured;
    throw new Error(`Unexpected useQuery call: ${name}`);
  }) as typeof useQuery);

  return render(<EmailPreference enabled={enabled} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useMutation).mockImplementation(((query: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(query);
    if (name === getFunctionName(api.members.setEmailBulletins)) return asMutation(setEmailBulletins);
    throw new Error(`Unexpected useMutation call: ${name}`);
  }) as typeof useMutation);
});

afterEach(cleanup);

test("a Member who has never opted out sees the toggle on", () => {
  renderToggle(true, true);
  expect(screen.getByLabelText(TOGGLE)).toBeChecked();
});

test("unticking opts the Member out", async () => {
  renderToggle(true, true);

  await act(async () => {
    fireEvent.click(screen.getByLabelText(TOGGLE));
  });

  expect(setEmailBulletins).toHaveBeenCalledWith({ enabled: false });
});

test("ticking opts the Member back in", async () => {
  renderToggle(false, true);

  await act(async () => {
    fireEvent.click(screen.getByLabelText(TOGGLE));
  });

  expect(setEmailBulletins).toHaveBeenCalledWith({ enabled: true });
});

// Offering to turn off email nobody is sending would be worse than silence.
test("nothing renders on a deployment with no mail provider", () => {
  const { container } = renderToggle(true, false);
  expect(container).toBeEmptyDOMElement();
});

test("nothing renders until the deployment's configuration is known", () => {
  const { container } = renderToggle(true, undefined);
  expect(container).toBeEmptyDOMElement();
});
