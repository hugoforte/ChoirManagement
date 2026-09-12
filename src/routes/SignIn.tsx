import { SignIn as ClerkSignIn } from "@clerk/clerk-react";
import { ThemeToggle } from "../design/ThemeToggle";

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 dark:bg-stone-950">
      <ThemeToggle />
      <p className="text-xs font-semibold tracking-wide text-brand-600 dark:text-brand-400">Member sign in</p>
      <ClerkSignIn afterSignInUrl="/" />
    </div>
  );
}
