// The Share Link landing page (#83, ADR-0004), reached at /s/:token with or
// without an account. No AppShell, like the public Event routes: a guest has
// no nav to show and no Member identity to put in it.
//
// The mode query decides what this route is before anything else loads, so
// the three outcomes stay separate components:
//
//   token mode            — render the Bulletin read-only, right here
//   sign-in-required mode — bounce through /sign-in, then to the reading view
//   no link at all        — "this link is no longer valid"
//
// Only the sign-in branch blocks on Clerk, and it does so from a component
// that mounts only in that branch. That is deliberate: the guest E2E project
// carries no Clerk secret at all, and a page that waits on Clerk's isLoaded
// there hung past every timeout in CI (see playwright.config.ts). An invalid
// token and a token-mode Bulletin both have to render without waiting on it.
import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Markdown } from "../design/Markdown";
import { ThemeToggle } from "../design/ThemeToggle";
import { formatTimestamp } from "../lib/datetime";
import { editedAt } from "../lib/bulletin";

export default function SharedBulletin() {
  const { token } = useParams<{ token: string }>();
  // The route cannot match without a token, but useParams types it optional.
  const shareToken = token ?? "";
  const mode = useQuery(api.public.getSharedBulletinMode, { token: shareToken });

  if (mode === undefined) return null; // loading
  if (mode === null) return <InvalidLink />;
  if (mode === "sign_in_required") return <SignInRequired token={shareToken} />;
  return <TokenBulletin token={shareToken} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4 dark:border-stone-800 dark:bg-stone-900">
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Shared Bulletin</p>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl p-6">{children}</main>
    </div>
  );
}

// A revoked, regenerated, unknown or not-yet-published link all land here.
// Deliberately a plain page rather than the 404 route: the URL is a real
// route that resolved, the credential in it is what stopped working, and a
// 404 would invite the holder to go hunting. It reveals nothing about
// whether the Bulletin exists.
function InvalidLink() {
  return (
    <Frame>
      <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-lg font-semibold">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          The Share Link may have been regenerated or revoked. Ask whoever sent it for a current link.
        </p>
        <Link
          to="/sign-in"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Sign in
        </Link>
      </div>
    </Frame>
  );
}

function TokenBulletin({ token }: { token: string }) {
  const bulletin = useQuery(api.public.getSharedBulletin, { token });

  if (bulletin === undefined) return null; // loading
  // The mode query said "token" a moment ago; a revoke landing in between
  // leaves this null, and the holder gets the same page as any dead link.
  if (bulletin === null) return <InvalidLink />;

  const edited = editedAt(bulletin);

  return (
    <Frame>
      <article className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
        <h1 className="text-lg font-semibold">{bulletin.title}</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {`Published ${formatTimestamp(bulletin.publishedAt)}`}
          {edited !== null && ` · Edited ${formatTimestamp(edited)}`}
        </p>
        {bulletin.event && (
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {bulletin.event.title} · {formatTimestamp(bulletin.event.startsAt)}
            {bulletin.event.location ? ` · ${bulletin.event.location}` : ""}
          </p>
        )}

        <Markdown source={bulletin.body} className="mt-4 text-sm text-stone-700 dark:text-stone-300" />

        {bulletin.remarks.length > 0 && (
          <>
            <h2 className="mt-6 text-xs font-semibold tracking-wide text-stone-500 dark:text-stone-400">
              Remarks
            </h2>
            <ul className="mt-2 divide-y divide-stone-100 text-sm dark:divide-stone-800">
              {bulletin.remarks.map((remark, i) => (
                <li key={i} className="py-1.5">
                  <span className="font-medium">{remark.pieceTitle}</span>
                  <span className="text-stone-600 dark:text-stone-400"> — {remark.text}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
          Shared read-only. Anyone with this link can read this Bulletin.
        </p>
      </article>
    </Frame>
  );
}

// Mounts only for a sign-in-required link, so Clerk's useAuth is never called
// on the guest paths above — see this file's header for why that matters.
//
// Mirrors MemberPage's preamble rather than rendering through it: MemberPage
// brings the AppShell and a Member identity this page has no use for, since
// every outcome here is a redirect.
function SignInRequired({ token }: { token: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const ensureCurrentMember = useMutation(api.members.ensureCurrentMember);
  const viewer = useQuery(api.members.viewer);
  const bulletinId = useQuery(
    api.bulletinShareLinks.resolveForMember,
    // requireMember-backed, so it must not subscribe until members.viewer has
    // resolved to a real Member — not merely until Clerk reports signed in
    // (AGENTS.md rule 9; this race caused a real white-screen crash once).
    viewer ? { token } : "skip",
  );

  // Someone invited by a Share Link may be signing in for the very first
  // time, so this route creates the Member record the same way every other
  // gated entry point does.
  useEffect(() => {
    if (isSignedIn) {
      void ensureCurrentMember();
    }
  }, [isSignedIn, ensureCurrentMember]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    // Clerk's SignIn reads redirect_url and returns here afterwards, so the
    // visitor lands on the Bulletin they were sent rather than the dashboard.
    return <Navigate to={`/sign-in?redirect_url=${encodeURIComponent(`/s/${token}`)}`} replace />;
  }

  // undefined: still loading. null: signed in, but ensureCurrentMember hasn't
  // created the row yet — the effect above is what resolves it.
  if (viewer === undefined || viewer === null) return <Frame>{SETTING_UP}</Frame>;
  if (bulletinId === undefined) return null;
  if (bulletinId === null) return <InvalidLink />;

  // A Member gets the real reading view rather than the guest rendering: they
  // can read every published Bulletin anyway, and the archive around it is
  // the more useful place to land.
  return <Navigate to={`/bulletins/${bulletinId}`} replace />;
}

const SETTING_UP = (
  <p className="text-sm text-stone-500 dark:text-stone-400">Setting up your account…</p>
);
