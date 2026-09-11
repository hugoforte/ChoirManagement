// One-off/idempotent setup: creates the Clerk test user used by the
// authenticated Playwright suite, if it doesn't already exist. Uses the
// "+clerk_test" email convention so sign-up/sign-in never sends real email
// (Clerk always accepts code 424242 for these) — see
// docs/architecture/ci-cd-and-testing.md.
//
// Usage: node scripts/e2e/ensure-clerk-test-user.mjs <email> <password> [firstName]
import "dotenv/config";
import { createClerkClient } from "@clerk/backend";

const [, , email, password, firstName] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/e2e/ensure-clerk-test-user.mjs <email> <password> [firstName]");
  process.exit(1);
}
if (!email.includes("+clerk_test@")) {
  console.error(`Refusing to create a non-"+clerk_test@" test user (${email}) — it would receive real email.`);
  process.exit(1);
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error("CLERK_SECRET_KEY is not set (check .env.test).");
  process.exit(1);
}

const clerkClient = createClerkClient({ secretKey });

const existing = await clerkClient.users.getUserList({ emailAddress: [email] });
if (existing.totalCount > 0) {
  console.log(`Clerk user already exists for ${email} (id: ${existing.data[0].id}).`);
  process.exit(0);
}

const user = await clerkClient.users.createUser({
  emailAddress: [email],
  password,
  firstName: firstName ?? "E2E",
  skipPasswordChecks: false,
});
console.log(`Created Clerk user for ${email} (id: ${user.id}).`);
