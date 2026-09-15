import { SignIn as ClerkSignIn } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import { ThemeToggle } from "../design/ThemeToggle";
import { safeRedirect } from "../lib/safeRedirect";

// A sign-in-required Share Link sends its visitor here and expects them back
// (#83). Without a redirect prop they would land on the dashboard having lost
// the Bulletin they were sent.
//
// fallbackRedirectUrl rather than the deprecated afterSignInUrl: Clerk
// documents fallback as "used when no other redirect props, environment
// variables or search params are present", so Clerk's own allow-listed
// handling of ?redirect_url wins and this is only the backstop. afterSignInUrl
// would instead have overridden that handling — which is how the hardcoded "/"
// it used to carry broke the Share Link return path in the first place.
//
// The param is still run through safeRedirect before being handed back: if
// Clerk rejects a hostile redirect_url and falls through to this value, it
// must not be the same hostile value unfiltered. With no param present this
// resolves to "/", exactly as before.
export default function SignIn() {
  const [searchParams] = useSearchParams();
  const redirectUrl = safeRedirect(searchParams.get("redirect_url"));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 dark:bg-stone-950">
      <ThemeToggle />
      <p className="text-xs font-semibold tracking-wide text-brand-600 dark:text-brand-400">Member sign in</p>
      <ClerkSignIn fallbackRedirectUrl={redirectUrl} signUpFallbackRedirectUrl={redirectUrl} />
    </div>
  );
}
