import { useMemo } from "react";
import { Link } from "react-router-dom";
import { SignOutButton } from "@clerk/clerk-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { MemberGate, isAdmin } from "../lib/memberGate";

export default function Home() {
  return <MemberGate>{(viewer) => <HomeContentForMember viewer={viewer} />}</MemberGate>;
}

function HomeContentForMember({ viewer }: { viewer: Doc<"members"> }) {
  const choirSettings = useQuery(api.choirSettings.get);
  // Stable for the component's lifetime — re-fetching Date.now() on every
  // render would resubscribe the query each time instead of once.
  const now = useMemo(() => Date.now(), []);
  const upcoming = useQuery(api.events.listUpcoming, { now });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">{choirSettings?.name ?? "ChoirManagement"}</h1>
        <SignOutButton>
          <button className="text-sm underline">Sign out</button>
        </SignOutButton>
      </div>
      <p className="mt-1 text-gray-600">Welcome, {viewer.name}.</p>

      <h2 className="mt-8 font-semibold">Upcoming Events</h2>
      {upcoming === undefined ? (
        <p className="text-gray-500">Loading…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-gray-500">Nothing scheduled yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {upcoming.map((event) => (
            <li key={event._id}>
              <Link to={`/events/${event._id}`} className="text-brand-600 underline hover:text-brand-700">
                {event.title}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <nav className="mt-8 flex gap-4 text-sm">
        <Link to="/library" className="text-brand-600 underline hover:text-brand-700">
          Music Library
        </Link>
        <Link to="/events" className="text-brand-600 underline hover:text-brand-700">
          Events
        </Link>
        <Link to="/public/events" className="text-brand-600 underline hover:text-brand-700">
          Public Events page
        </Link>
        <Link to="/members" className="text-brand-600 underline hover:text-brand-700">
          Member Roster
        </Link>
        {isAdmin(viewer) && (
          <Link to="/settings" className="text-brand-600 underline hover:text-brand-700">
            Settings
          </Link>
        )}
      </nav>
    </div>
  );
}
