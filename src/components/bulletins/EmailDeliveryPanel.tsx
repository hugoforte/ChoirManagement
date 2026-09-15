// What became of the email a publish sent (#52). The point of the panel is
// the named failures: #52 asks for bounces to be visible to the Director
// rather than silent, and a Director has no access to deployment logs, so
// "Chris Chorister — Mailbox does not exist" has to appear in the app or it
// appears nowhere.
//
// Counts move on their own as Resend's webhook arrives, because this is a
// Convex subscription rather than a snapshot.
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { labelClass } from "../../design/forms";

const mutedText = "text-xs text-stone-500 dark:text-stone-400";

// Ordered as an email's life runs, not alphabetically, so the row reads as
// progress. `queued` leads because a row sitting there is the one state that
// means "not finished yet".
const COUNT_LABELS = [
  ["queued", "Queued"],
  ["sent", "Sent"],
  ["delivered", "Delivered"],
  ["bounced", "Bounced"],
  ["failed", "Failed"],
] as const;

export function EmailDeliveryPanel({ bulletinId }: { bulletinId: Id<"bulletins"> }) {
  const summary = useQuery(api.bulletinEmails.summaryForBulletin, { bulletinId });

  const total =
    summary === undefined
      ? 0
      : COUNT_LABELS.reduce((sum, [status]) => sum + summary[status], 0);

  return (
    <section className="border-t border-stone-200 pt-3 dark:border-stone-800">
      <h2 className={labelClass}>Email delivery</h2>

      {summary === undefined ? (
        <p className={`mt-2 ${mutedText}`}>Loading…</p>
      ) : total === 0 ? (
        // Covers both "the Director unticked the box" and "this deployment
        // has no mail provider" — from here they are the same fact.
        <p className={`mt-2 ${mutedText}`}>This Bulletin wasn't emailed.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {COUNT_LABELS.filter(([status]) => summary[status] > 0).map(([status, label]) => (
              <div key={status} className="flex items-center gap-1">
                <dt className={mutedText}>{label}</dt>
                <dd className="font-medium">{summary[status]}</dd>
              </div>
            ))}
          </dl>

          {summary.problems.length > 0 && (
            <ul className="space-y-1 text-sm">
              {summary.problems.map((problem, index) => (
                <li key={index} className="text-danger">
                  {problem.memberName} — {problem.status === "bounced" ? "bounced" : "failed"}
                  {problem.error === null ? "" : `: ${problem.error}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
