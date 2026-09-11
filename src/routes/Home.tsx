import { useEffect, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const ensureCurrentMember = useMutation(api.members.ensureCurrentMember);

  // Create-on-first-login: no-op once the Member record already exists.
  useEffect(() => {
    if (isSignedIn) {
      void ensureCurrentMember();
    }
  }, [isSignedIn, ensureCurrentMember]);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Navigate to="/public/events" replace />;

  return <HomeContent />;
}

function HomeContent() {
  // members.viewer never throws — it returns null for "not signed in" AND
  // for "signed in via Clerk, but ensureCurrentMember hasn't finished yet."
  // Only once it resolves to a real Member do we query anything that's
  // requireMember-gated (choirSettings.get, events.listUpcoming) — those
  // throw if there's no Member record yet, and firing them before this
  // check is what caused the white-screen crash right after first sign-in.
  const viewer = useQuery(api.members.viewer);

  if (viewer === undefined) {
    return <p className="p-8 text-gray-500">Loading…</p>;
  }
  if (viewer === null) {
    return <p className="p-8 text-gray-500">Setting up your account…</p>;
  }

  return <HomeContentForMember viewer={viewer} />;
}

function HomeContentForMember({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  // Stable for the component's lifetime — re-fetching Date.now() on every
  // render would resubscribe the query each time instead of once.
  const now = useMemo(() => Date.now(), []);
  const upcoming = useQuery(api.events.listUpcoming, { now });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{choirSettings?.name ?? "ChoirManagement"}</h1>
      <p className="mt-1 text-gray-600">Welcome, {viewer.name}.</p>

      <h2 className="mt-8 font-semibold">Upcoming Events</h2>
      {upcoming === undefined ? (
        <p className="text-gray-500">Loading…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-gray-500">Nothing scheduled yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {upcoming.map((event) => (
            <li key={event._id}>{event.title}</li>
          ))}
        </ul>
      )}

      <nav className="mt-8 flex gap-4 text-sm">
        <Link to="/public/events" className="underline">
          Public Events page
        </Link>
      </nav>
    </div>
  );
}
