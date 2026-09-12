// Seeds one app Member per Role into a non-production Convex deployment,
// each pre-linked to a dedicated Clerk test user, so authenticated E2E and
// manual preview review work against a fresh database with no "promote me"
// step. Idempotent: safe to re-run.
//
// Creates any missing Clerk users itself (via the Backend API), resolves each
// one's id, assembles the Convex token identifier (`<issuer>|<clerk_user_id>`
// — what members.ensureCurrentMember matches on), and upserts the Member row.
//
// Usage:
//   node scripts/e2e/seed-role-members.mjs --deployment-name <name>
//   node scripts/e2e/seed-role-members.mjs --deployment-name <name> \
//     --extra admin:someone@example.com
//
// Requires CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY (see .env.test).
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";

const ROLES = ["admin", "director", "chorister"];

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=").slice(1).join("=");
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const deploymentName = arg("deployment-name");
// --publish-default writes the resolved set to the project-level default for
// *preview* deployments, which is how each newly provisioned per-branch
// backend gets its Role Members via `--preview-run seed:preview` without any
// per-deployment setup.
const publishDefault = process.argv.includes("--publish-default");
if (!deploymentName && !publishDefault) {
  console.error("Need --deployment-name (seed a live deployment) and/or --publish-default.");
  process.exit(1);
}

const secretKey = process.env.CLERK_SECRET_KEY;
const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!secretKey || !publishableKey) {
  console.error("Need CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY (check .env.test).");
  process.exit(1);
}

// The issuer is encoded in the publishable key: base64 of "<host>$".
function issuerFromPublishableKey(pk) {
  const encoded = pk.replace(/^pk_(test|live)_/, "");
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  if (!host.includes(".")) {
    throw new Error(`Could not derive Clerk issuer from publishable key (got "${host}").`);
  }
  return `https://${host}`;
}

const issuer = issuerFromPublishableKey(publishableKey);
const clerkClient = createClerkClient({ secretKey });

// Kept deliberately short and typo-proof, because a human signs in with these
// by hand to review a preview (often on a phone).
//
// The "+clerk_test" suffix is the one non-negotiable part: it's what makes
// Clerk skip real email delivery and always accept the code 424242, which
// unattended E2E needs — and it also avoids the "new device" email
// verification that would otherwise interrupt a manual sign-in.
// example.com is IANA-reserved for exactly this purpose. Note a bare
// two-letter TLD like "a.a" is rejected (form_param_format_invalid).
function emailForRole(role) {
  return `${role}+clerk_test@example.com`;
}

// One character. Clerk's password policy on this instance demands 15+, so this
// only works via skipPasswordChecks below. Safe because these accounts exist
// only on throwaway preview backends — see docs/guides/setup-automation-notes.md.
const TEST_PASSWORD = "a";

async function ensureClerkUser(email, firstName) {
  const found = await clerkClient.users.getUserList({ emailAddress: [email] });
  if (found.totalCount > 0) return found.data[0];
  console.log(`  creating Clerk user ${email}`);
  return await clerkClient.users.createUser({
    emailAddress: [email],
    password: TEST_PASSWORD,
    skipPasswordChecks: true,
    firstName,
  });
}

// Runs the Convex CLI's own entry point under this Node binary rather than
// going through npx. Two Windows problems avoided: `shell: true` lets cmd.exe
// mangle the quotes and "|" in the JSON payload (yielding "invalid character
// 'h'" on the https:// in clerkUserId), while `shell: false` can't spawn
// npx.cmd at all on Node >=20 (EINVAL). Calling the .js directly sidesteps both.
// Resolved by path, not by require.resolve: convex's package.json "exports"
// map doesn't expose ./bin/main.js.
const convexCli = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/convex/bin/main.js",
);

function upsertMember({ clerkUserId, name, email, role }) {
  execFileSync(
    process.execPath,
    [
      convexCli,
      "run",
      "seed:upsertRoleMember",
      JSON.stringify({ clerkUserId, name, email, role }),
      "--deployment-name",
      deploymentName,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

const targets = ROLES.map((role) => ({
  role,
  email: emailForRole(role),
  name: `Test ${role[0].toUpperCase()}${role.slice(1)}`,
}));

// --extra <role>:<email> seeds a real person (e.g. the maintainer reviewing a
// preview) at a given Role, without inventing a test account for them.
const extras = [];
process.argv.forEach((a, i) => {
  if (a === "--extra" && process.argv[i + 1]) extras.push(process.argv[i + 1]);
  if (a.startsWith("--extra=")) extras.push(a.slice("--extra=".length));
});
for (const spec of extras) {
  const [role, email] = spec.split(":");
  if (!ROLES.includes(role) || !email) {
    console.error(`--extra must be "<${ROLES.join("|")}>:<email>", got: ${spec}`);
    process.exit(1);
  }
  targets.push({ role, email, name: email.split("@")[0] });
}

const resolved = [];
console.log(
  `Resolving Role Members (issuer ${issuer})` +
    (deploymentName ? ` -> deployment "${deploymentName}"` : "") +
    (publishDefault ? " -> preview default SEED_ROLE_MEMBERS" : ""),
);
for (const t of targets) {
  const isTestAccount = t.email.includes("+clerk_test@");
  let user;
  if (isTestAccount) {
    user = await ensureClerkUser(t.email, t.name);
  } else {
    const found = await clerkClient.users.getUserList({ emailAddress: [t.email] });
    if (found.totalCount === 0) {
      console.error(
        `  !! no Clerk user for ${t.email} — they must sign up once before they can be seeded.`,
      );
      process.exitCode = 1;
      continue;
    }
    user = found.data[0];
  }

  const clerkUserId = `${issuer}|${user.id}`;
  resolved.push({ clerkUserId, name: t.name, email: t.email, role: t.role });

  if (deploymentName) {
    upsertMember({ clerkUserId, name: t.name, email: t.email, role: t.role });
  }
  console.log(`  ${t.role.padEnd(9)} ${t.email} -> ${user.id}`);
}

if (publishDefault) {
  execFileSync(
    process.execPath,
    [
      convexCli,
      "env",
      "default",
      "set",
      "SEED_ROLE_MEMBERS",
      JSON.stringify(resolved),
      "--type",
      "preview",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
}
console.log("Done.");
