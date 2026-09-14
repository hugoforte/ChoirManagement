import { SignIn as ClerkSignIn } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { ThemeToggle } from "../design/ThemeToggle";

// A sign-in-required Share Link sends its visitor here and expects them back
// (#83): without this, the explicit afterSignInUrl below would override the
// redirect_url Clerk otherwise honours, and everyone would land on the
// dashboard having lost the Bulletin they were sent.
//
// Only same-site paths are accepted. An absolute URL in redirect_url would
// make /sign-in an open redirect — a phishing link that genuinely starts on
// this app's domain and bounces to an attacker's after sign-in. "//host" is
// rejected too: it is protocol-relative, not a path.
function safeRedirect(target: string | null): string {
  if (!target) return "/";
  if (!target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

export default function SignIn() {
  const [searchParams] = useSearchParams();
  const redirectUrl = safeRedirect(searchParams.get("redirect_url"));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 dark:bg-stone-950">
      <ThemeToggle />
      <p className="text-xs font-semibold tracking-wide text-brand-600 dark:text-brand-400">Member sign in</p>
      <ClerkSignIn afterSignInUrl={redirectUrl} afterSignUpUrl={redirectUrl} />
    </div>
  );
}
