import { SignIn as ClerkSignIn } from "@clerk/clerk-react";

export default function SignIn() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 font-serif dark:bg-stone-950">
      <p className="font-sans text-xs uppercase tracking-[0.2em] text-amber-700 dark:text-amber-500">Member area</p>
      <ClerkSignIn afterSignInUrl="/" />
    </div>
  );
}
