import { SignIn as ClerkSignIn } from "@clerk/clerk-react";

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Member sign in</p>
      <ClerkSignIn afterSignInUrl="/" />
    </div>
  );
}
