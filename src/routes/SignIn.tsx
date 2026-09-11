import { SignIn as ClerkSignIn } from "@clerk/clerk-react";

export default function SignIn() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <ClerkSignIn afterSignInUrl="/" />
    </div>
  );
}
